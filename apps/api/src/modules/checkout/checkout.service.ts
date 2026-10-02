import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import type {
  CheckoutQuote,
  CheckoutQuoteRequest,
  PaymentOption,
  PaymentProviderCode,
  PlaceOrder,
  PlacedOrder,
} from '@optical/shared/checkout';
import { checkoutQuoteRequestSchema, placeOrderSchema } from '@optical/shared/checkout';
import type { LensConfig } from '@optical/shared/lens';
import { formatMoney } from '@optical/shared/money';
import { priceOrder, type PricingResult } from '@optical/shared/pricing';
import { estimateDelivery } from '@optical/shared/pricing/delivery';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';
import { sha256Hex } from '../../lib/tokens';
import type { CartRow } from '../cart/cart.repository';
import { toPricingItems, type CartService } from '../cart/cart.service';
import { holdStock, redeemCoupon, commitHolds, transition, type Tx } from '../orders/lifecycle';
import type { PaymentGateway } from '../payments/payment-gateway';
import { isFirstOrder, loadCoupon } from './coupons';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

/** JSON with sorted keys, so the same request always hashes the same. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  const json = JSON.stringify(value) as string | undefined;
  return json ?? 'null';
}

interface PricedCart {
  cart: CartRow;
  pricing: PricingResult;
  coupon: Awaited<ReturnType<typeof loadCoupon>>;
}

/** Quotes delivery and payment options, and places orders from the bag. */
export class CheckoutService {
  constructor(
    private readonly db: Db,
    private readonly carts: CartService,
    private readonly payments: PaymentGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async priceCart(
    sessionHash: string | null,
    options: {
      speed: 'standard' | 'express';
      postalCode?: string;
      provider?: PaymentProviderCode;
      email?: string;
    },
  ): Promise<PricedCart> {
    const cart = sessionHash ? await this.carts.repository().find(sessionHash, this.now()) : null;
    if (!cart || cart.items.length === 0) throw new AppError('CONFLICT', 'Your bag is empty.');
    const email = options.email ?? null;
    const coupon = cart.couponCode ? await loadCoupon(this.db, cart.couponCode, email) : null;
    const pricing = priceOrder({
      items: toPricingItems(cart.items),
      coupon,
      now: this.now(),
      isFirstOrder: await isFirstOrder(this.db, email),
      shipping: { speed: options.speed, postalCode: options.postalCode ?? null },
      paymentMethod: options.provider === 'cod' ? 'cod' : 'prepaid',
    });
    return { cart, pricing, coupon };
  }

  private paymentOptions(pricing: PricingResult): PaymentOption[] {
    return this.payments.codes().map((provider) =>
      provider === 'cod'
        ? {
            provider,
            available: pricing.cashOnDelivery.available,
            reason: pricing.cashOnDelivery.reason,
            feeMinor: commerce.cashOnDelivery.feeMinor,
          }
        : { provider, available: true, reason: null, feeMinor: 0 },
    );
  }

  async quote(sessionHash: string | null, input: CheckoutQuoteRequest): Promise<CheckoutQuote> {
    const request = checkoutQuoteRequestSchema.parse(input);
    const { cart, pricing } = await this.priceCart(sessionHash, {
      speed: request.shippingSpeed,
      ...(request.postalCode ? { postalCode: request.postalCode } : {}),
      ...(request.paymentProvider ? { provider: request.paymentProvider } : {}),
      ...(request.email ? { email: request.email } : {}),
    });
    const needsLensProduction = cart.items.some((item) => item.lensConfig !== null);
    const window = (speed: 'standard' | 'express') => {
      const estimate = estimateDelivery({
        orderedAt: this.now(),
        speed,
        postalCode: request.postalCode ?? null,
        needsLensProduction,
      });
      return { earliest: estimate.earliest, latest: estimate.latest };
    };
    return {
      pricing,
      delivery: { standard: window('standard'), express: window('express') },
      paymentOptions: this.paymentOptions(pricing),
    };
  }

  /**
   * Places an order from the bag. Idempotent: the same key and body return
   * the same order, a reused key with a different body is refused. Prices
   * are recomputed here and must match what the customer agreed to.
   */
  async placeOrder(
    sessionHash: string | null,
    idempotencyKey: string | undefined,
    input: PlaceOrder,
  ): Promise<PlacedOrder> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey))
      throw new AppError(
        'BAD_REQUEST',
        'Send an Idempotency-Key header (16 to 128 letters, digits, - or _).',
      );
    const request = placeOrderSchema.parse(input);
    const requestHash = sha256Hex(stableJson({ request, sessionHash }));

    const previous = await this.db.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, idempotencyHash: true },
    });
    if (previous) {
      if (previous.idempotencyHash !== requestHash)
        throw new AppError(
          'CONFLICT',
          'This checkout attempt was already used for a different order. Reload the page.',
        );
      return this.payments.placedOrder(previous.id);
    }

    if (!this.payments.codes().includes(request.paymentProvider))
      throw new AppError('VALIDATION_FAILED', 'That payment method is not available.', [
        { path: 'paymentProvider', message: 'Choose another way to pay.' },
      ]);
    const { cart, pricing, coupon } = await this.priceCart(sessionHash, {
      speed: request.shippingSpeed,
      postalCode: request.address.postalCode,
      provider: request.paymentProvider,
      email: request.contact.email,
    });
    if (pricing.issues.length > 0)
      throw new AppError(
        'VALIDATION_FAILED',
        pricing.issues[0]?.message ?? 'Your bag needs attention.',
      );
    if (pricing.coupon && !pricing.coupon.applied)
      throw new AppError('VALIDATION_FAILED', pricing.coupon.message, [
        { path: 'coupon', message: pricing.coupon.message },
      ]);
    if (pricing.totalMinor !== request.expectedTotalMinor)
      throw new AppError(
        'PRICE_CHANGED',
        `Your total is now ${formatMoney(pricing.totalMinor)}. Check the summary and place the order again.`,
        [{ path: 'expectedTotalMinor', message: String(pricing.totalMinor) }],
      );

    const orderId = await this.db.$transaction(
      (tx) =>
        this.createOrder(tx, {
          request,
          cart,
          pricing,
          coupon,
          idempotencyKey,
          requestHash,
          sessionHash,
        }),
      { timeout: 15_000 },
    );
    return this.payments.startPayment(orderId);
  }

  private async createOrder(
    tx: Tx,
    input: {
      request: ReturnType<typeof placeOrderSchema.parse>;
      cart: CartRow;
      pricing: PricingResult;
      coupon: PricedCart['coupon'];
      idempotencyKey: string;
      requestHash: string;
      sessionHash: string | null;
    },
  ): Promise<string> {
    const { request, cart, pricing, coupon } = input;
    const now = this.now();
    const cod = request.paymentProvider === 'cod';
    const needsLensProduction = cart.items.some((item) => item.lensConfig !== null);
    const configs = cart.items.map((item) => item.lensConfig as LensConfig | null);
    const awaitingPrescription = configs.some(
      (config) => config?.prescription?.mode === 'later' || config?.prescription?.mode === 'upload',
    );
    const estimate = estimateDelivery({
      orderedAt: now,
      speed: request.shippingSpeed,
      postalCode: request.address.postalCode,
      needsLensProduction,
    });
    const [sequence] = await tx.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('order_number_seq')`;
    const year = String(now.getUTCFullYear()).slice(2);
    const number = `${brand.orderNumberPrefix}-${year}-${String(sequence?.nextval ?? 0).padStart(6, '0')}`;

    // Prescriptions typed in at checkout are stored as their own records.
    const prescriptionIds = await Promise.all(
      configs.map(async (config) => {
        const source = config?.prescription;
        if (source?.mode === 'upload') return source.uploadId;
        if (source?.mode !== 'manual') return null;
        const created = await tx.prescription.create({
          data: {
            label: `${request.address.fullName}, ${now.toISOString().slice(0, 10)}`,
            values: source.rx,
            ownerTokenHash: input.sessionHash,
          },
        });
        return created.id;
      }),
    );

    const order = await tx.order.create({
      data: {
        number,
        email: request.contact.email,
        phone: request.contact.phone,
        currency: pricing.currency,
        subtotalMinor: pricing.subtotalMinor,
        discountMinor: pricing.discountMinor,
        shippingMinor: pricing.shipping.feeMinor,
        codFeeMinor: pricing.codFee.feeMinor,
        taxMinor: pricing.tax.totalMinor,
        totalMinor: pricing.totalMinor,
        couponCode: pricing.coupon?.applied ? pricing.coupon.code : null,
        shippingAddress: { ...request.address, phone: request.contact.phone },
        shippingSpeed: request.shippingSpeed,
        paymentProvider: request.paymentProvider.toUpperCase() as
          'MOCK' | 'RAZORPAY' | 'STRIPE' | 'COD',
        estimatedDeliveryFrom: new Date(`${estimate.earliest}T00:00:00Z`),
        estimatedDeliveryTo: new Date(`${estimate.latest}T00:00:00Z`),
        awaitingPrescription,
        customerNote: request.note ?? null,
        idempotencyKey: input.idempotencyKey,
        idempotencyHash: input.requestHash,
        cartId: cart.id,
        placedAt: now,
        events: { create: { toStatus: 'PENDING_PAYMENT' } },
        payments: {
          create: {
            provider: request.paymentProvider.toUpperCase() as
              'MOCK' | 'RAZORPAY' | 'STRIPE' | 'COD',
            amountMinor: pricing.totalMinor,
            currency: pricing.currency,
            method: cod ? 'cash' : null,
            status: cod ? 'PENDING' : 'CREATED',
          },
        },
        items: {
          create: cart.items.map((item, index) => {
            const lines = pricing.lines.filter((line) => line.itemKey === item.id);
            return {
              productId: item.variant.productId,
              variantId: item.variantId,
              prescriptionId: prescriptionIds[index] ?? null,
              sku: item.variant.sku,
              productName: item.variant.product.name,
              colourName: item.variant.colourName,
              imageUrl: item.variant.images[0]?.url ?? null,
              quantity: item.quantity,
              unitPriceMinor: item.unitPriceMinor,
              lensConfig: item.lensConfig ?? undefined,
              priceLines: lines as unknown as Prisma.InputJsonValue,
              totalMinor: lines.reduce(
                (sum, line) => sum + line.amountMinor - line.discountMinor,
                0,
              ),
            };
          }),
        },
      },
    });

    const lines = cart.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      name: `${item.variant.product.name} in ${item.variant.colourName}`,
    }));
    const holdUntil = new Date(now.getTime() + commerce.policies.stockReservationMinutes * 60_000);
    await holdStock(tx, order.id, lines, holdUntil);
    if (coupon && pricing.coupon?.applied)
      await redeemCoupon(tx, coupon, {
        orderId: order.id,
        email: request.contact.email,
        discountMinor: pricing.discountMinor,
      });

    if (cod) {
      // Nothing to pay online: the sale is final now, and fulfilment can start.
      await commitHolds(tx, order.id, now);
      if (awaitingPrescription)
        await transition(
          tx,
          {
            id: order.id,
            status: 'PENDING_PAYMENT',
            paymentProvider: 'COD',
            awaitingPrescription,
            needsProduction: needsLensProduction,
          },
          'PRESCRIPTION_REVIEW',
        );
    }
    return order.id;
  }
}
