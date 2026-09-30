import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import { prescriptionSchema, type PrescriptionInput } from '@optical/shared/rx';
import {
  defaultLensCatalog,
  lensConfigSchema,
  quoteLens,
  type LensConfigInput,
} from '@optical/shared/lens';
import { happyPath, type OrderStatus } from '@optical/shared/orders';
import {
  estimateDelivery,
  priceOrder,
  type CouponDefinition,
  type PricingItem,
} from '@optical/shared/pricing';
import type { Db } from '../../src/infra/prisma';
import type { SeededProduct } from './catalog';
import { toJson } from './json';
import { reviewerNames, reviewTexts } from './reviews';
import type { Random } from './random';

interface OrderSpec {
  status: OrderStatus;
  customer: string;
  items: { slug: string; variant?: number; quantity?: number; lens?: LensConfigInput }[];
  coupon?: string;
  cod?: boolean;
  express?: boolean;
  daysAgo: number;
  note?: string;
}

const ashaRx: PrescriptionInput = {
  right: { sph: -2.75, cyl: -0.75, axis: 170 },
  left: { sph: -2.5, cyl: -0.5, axis: 10 },
  pd: { kind: 'single', value: 62 },
};
const rahulRx: PrescriptionInput = {
  right: { sph: 1.5, add: 2 },
  left: { sph: 1.75, add: 2 },
  pd: { kind: 'dual', right: 32, left: 31.5 },
};

const sv = (rx: PrescriptionInput): LensConfigInput => ({
  purpose: 'single-vision',
  prescription: { mode: 'manual', rx: prescriptionSchema.parse(rx) },
  indexCode: '1.61',
  packageCode: 'complete',
});

const orderSpecs: OrderSpec[] = [
  {
    status: 'PENDING_PAYMENT',
    customer: 'rahul@example.com',
    items: [{ slug: 'sable', variant: 1 }],
    daysAgo: 0,
  },
  { status: 'PAYMENT_FAILED', customer: 'guest', items: [{ slug: 'pike' }], daysAgo: 1 },
  {
    status: 'PAID',
    customer: 'asha@example.com',
    items: [{ slug: 'reed', variant: 1 }, { slug: 'lens-care-kit' }],
    daysAgo: 1,
    coupon: 'FREESHIP',
  },
  {
    status: 'PRESCRIPTION_REVIEW',
    customer: 'rahul@example.com',
    items: [
      {
        slug: 'isla',
        lens: {
          purpose: 'progressive',
          prescription: { mode: 'later' },
          indexCode: '1.56',
          packageCode: 'complete',
        },
      },
    ],
    daysAgo: 2,
  },
  {
    status: 'IN_PRODUCTION',
    customer: 'asha@example.com',
    items: [{ slug: 'juniper', variant: 1, lens: sv(ashaRx) }],
    daysAgo: 3,
    coupon: 'FLAT300',
  },
  {
    status: 'QUALITY_CHECK',
    customer: 'guest',
    items: [{ slug: 'pixel', lens: { purpose: 'computer', packageCode: 'essential' } }],
    daysAgo: 4,
    express: true,
  },
  {
    status: 'SHIPPED',
    customer: 'rahul@example.com',
    items: [
      { slug: 'arlo', variant: 2 },
      { slug: 'hard-case', variant: 1 },
    ],
    daysAgo: 3,
    cod: true,
  },
  {
    status: 'DELIVERED',
    customer: 'asha@example.com',
    items: [{ slug: 'harbour', variant: 1, lens: sv(ashaRx) }],
    daysAgo: 40,
  },
  {
    status: 'DELIVERED',
    customer: 'asha@example.com',
    items: [{ slug: 'sol', variant: 2 }],
    daysAgo: 30,
  },
  {
    status: 'DELIVERED',
    customer: 'rahul@example.com',
    items: [
      {
        slug: 'linden',
        lens: {
          purpose: 'progressive',
          prescription: { mode: 'manual', rx: prescriptionSchema.parse(rahulRx) },
          indexCode: '1.61',
          packageCode: 'premium',
        },
      },
    ],
    daysAgo: 25,
  },
  {
    status: 'DELIVERED',
    customer: 'guest',
    items: [{ slug: 'wren', lens: { purpose: 'zero-power', packageCode: 'essential' } }],
    daysAgo: 20,
    coupon: 'WELCOME10',
  },
  {
    status: 'CANCELLED',
    customer: 'rahul@example.com',
    items: [{ slug: 'nash' }],
    daysAgo: 12,
    note: 'Customer ordered the wrong size.',
  },
  {
    status: 'RETURN_REQUESTED',
    customer: 'asha@example.com',
    items: [{ slug: 'haven' }],
    daysAgo: 9,
  },
  { status: 'RETURNED', customer: 'guest', items: [{ slug: 'teo', variant: 1 }], daysAgo: 18 },
  {
    status: 'REFUNDED',
    customer: 'rahul@example.com',
    items: [{ slug: 'rowan', variant: 2 }],
    daysAgo: 28,
  },
];

/** Builds the event path from placement to `target`, including detours (cancel, return). */
function statusPath(
  target: OrderStatus,
  needsProduction: boolean,
  cod: boolean,
  rxLater: boolean,
): OrderStatus[] {
  const forward = happyPath({
    needsProduction,
    cashOnDelivery: cod,
    prescriptionProvidedLater: rxLater,
  });
  if (forward.includes(target)) return forward.slice(0, forward.indexOf(target) + 1);
  switch (target) {
    case 'PAYMENT_FAILED':
      return ['PENDING_PAYMENT', 'PAYMENT_FAILED'];
    case 'CANCELLED':
      return ['PENDING_PAYMENT', 'PAID', 'CANCELLED'];
    case 'RETURN_REQUESTED':
      return [...forward, 'RETURN_REQUESTED'];
    case 'RETURNED':
      return [...forward, 'RETURN_REQUESTED', 'RETURNED'];
    case 'REFUNDED':
      return [...forward, 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'];
    default:
      throw new Error(`No seed path to ${target}`);
  }
}

function toCouponDefinition(
  coupon: Awaited<ReturnType<Db['coupon']['findUniqueOrThrow']>>,
): CouponDefinition {
  return {
    ...coupon,
    kind: coupon.kind as CouponDefinition['kind'],
    customerUsageCount: 0,
  };
}

/** Seeds orders in every status, with payments, timelines, redemptions and verified reviews. */
export async function seedOrders(
  db: Db,
  products: SeededProduct[],
  users: Map<string, string>,
  random: Random,
  now: Date,
) {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const firstOrderSeen = new Set<string>();
  const deliveredItems: {
    orderItemId: string;
    productId: string;
    userId: string | null;
    name: string;
  }[] = [];

  // Prescriptions: Asha's is verified; Rahul's progressive one is waiting for review.
  const admin = users.get('admin@example.com') ?? null;
  const ashaId = users.get('asha@example.com') ?? null;
  const ashaPrescription = await db.prescription.create({
    data: {
      userId: ashaId,
      label: 'My glasses, 2026',
      values: prescriptionSchema.parse(ashaRx),
      prescribedAt: new Date(now.getTime() - 60 * 86_400_000),
      expiresAt: new Date(now.getTime() + 670 * 86_400_000),
      status: 'VERIFIED',
      verifiedById: admin,
      verifiedAt: new Date(now.getTime() - 41 * 86_400_000),
    },
  });

  // Oldest first, so order numbers and "first order" coupons follow real time.
  const chronological = [...orderSpecs].sort((a, b) => b.daysAgo - a.daysAgo);
  for (const [index, spec] of chronological.entries()) {
    const placedAt = new Date(now.getTime() - spec.daysAgo * 86_400_000 - index * 3_600_000);
    const userId = spec.customer === 'guest' ? null : (users.get(spec.customer) ?? null);
    const email = spec.customer === 'guest' ? 'guest.buyer@example.com' : spec.customer;
    const address =
      spec.customer === 'asha@example.com'
        ? {
            fullName: 'Asha Kulkarni',
            phone: '+919800000003',
            line1: '14, 2nd Cross, Indiranagar',
            city: 'Bengaluru',
            state: 'Karnataka',
            postalCode: '560038',
            country: 'IN',
          }
        : spec.customer === 'rahul@example.com'
          ? {
              fullName: 'Rahul Menon',
              phone: '+919800000004',
              line1: 'B-702, Sea Breeze Apartments, Carter Road',
              city: 'Mumbai',
              state: 'Maharashtra',
              postalCode: '400050',
              country: 'IN',
            }
          : {
              fullName: 'Meera Iyer',
              phone: '+919800000005',
              line1: '22, Lake View Road',
              city: 'Guwahati',
              state: 'Assam',
              postalCode: '781005',
              country: 'IN',
            };

    const lines = spec.items.map((item, position) => {
      const product = bySlug.get(item.slug);
      if (!product) throw new Error(`Seed order references unknown product ${item.slug}`);
      const variant = product.variants[item.variant ?? 0] ?? product.variants[0];
      if (!variant) throw new Error(`${item.slug} has no variants`);
      let lensLines: PricingItem['lensLines'] = undefined;
      let lensConfig = null;
      if (item.lens && product.model) {
        const [lensWidthMm, , , lensHeightMm] = product.model.mm;
        const quote = quoteLens(defaultLensCatalog, lensConfigSchema.parse(item.lens), {
          rimType: product.model.rim,
          lensHeightMm,
          lensWidthMm,
        });
        if (!quote.ok)
          throw new Error(
            `Seed lens quote failed for ${item.slug}: ${JSON.stringify(quote.errors)}`,
          );
        lensLines = quote.lines;
        lensConfig = quote.config;
      }
      const pricingItem: PricingItem = {
        key: String(position),
        name: product.name,
        kind: product.model ? 'frame' : 'accessory',
        unitPriceMinor: product.priceMinor,
        quantity: item.quantity ?? 1,
        ...(lensLines ? { lensLines } : {}),
      };
      return { product, variant, lensConfig, pricingItem };
    });

    const couponRow = spec.coupon
      ? await db.coupon.findUniqueOrThrow({ where: { code: spec.coupon } })
      : null;
    const pricing = priceOrder({
      items: lines.map((line) => line.pricingItem),
      coupon: couponRow ? toCouponDefinition(couponRow) : null,
      now: placedAt,
      isFirstOrder: !firstOrderSeen.has(email),
      shipping: { speed: spec.express ? 'express' : 'standard', postalCode: address.postalCode },
      paymentMethod: spec.cod ? 'cod' : 'prepaid',
    });
    firstOrderSeen.add(email);
    if (pricing.issues.length)
      throw new Error(`Seed order ${index} has pricing issues: ${JSON.stringify(pricing.issues)}`);
    if (spec.coupon && !pricing.coupon?.applied) {
      throw new Error(
        `Seed order ${index} expects ${spec.coupon} to apply: ${pricing.coupon ? pricing.coupon.message : 'no coupon'}`,
      );
    }

    // Any lenses, even zero-power, are cut and fitted to the frame.
    const needsProduction = lines.some((line) => line.lensConfig !== null);
    const rxLater = lines.some((line) => line.lensConfig?.prescription?.mode === 'later');
    const path = statusPath(spec.status, needsProduction, spec.cod ?? false, rxLater);
    const estimate = estimateDelivery({
      orderedAt: placedAt,
      speed: spec.express ? 'express' : 'standard',
      postalCode: address.postalCode,
      needsLensProduction: needsProduction,
    });
    const [seq] = await db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
    const number = `${brand.orderNumberPrefix}-${String(placedAt.getUTCFullYear()).slice(2)}-${String(seq?.nextval ?? 0).padStart(6, '0')}`;
    const paidStatuses: OrderStatus[] = [
      'PAID',
      'PRESCRIPTION_REVIEW',
      'IN_PRODUCTION',
      'QUALITY_CHECK',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'RETURNED',
      'REFUNDED',
    ];
    const wasPaid =
      !spec.cod && path.some((status) => paidStatuses.includes(status) && status !== 'CANCELLED');

    const order = await db.order.create({
      data: {
        number,
        userId,
        email,
        phone: address.phone,
        status: spec.status,
        currency: commerce.currency,
        subtotalMinor: pricing.subtotalMinor,
        discountMinor: pricing.discountMinor,
        shippingMinor: pricing.shipping.feeMinor,
        codFeeMinor: pricing.codFee.feeMinor,
        taxMinor: pricing.tax.totalMinor,
        totalMinor: pricing.totalMinor,
        couponCode: pricing.coupon?.applied ? pricing.coupon.code : null,
        shippingAddress: address,
        shippingSpeed: spec.express ? 'express' : 'standard',
        paymentProvider: spec.cod ? 'COD' : 'MOCK',
        estimatedDeliveryFrom: new Date(estimate.earliest),
        estimatedDeliveryTo: new Date(estimate.latest),
        awaitingPrescription: spec.status === 'PRESCRIPTION_REVIEW',
        internalNote: spec.note ?? null,
        placedAt,
        cancelledAt: spec.status === 'CANCELLED' ? new Date(placedAt.getTime() + 86_400_000) : null,
        trackingNumber: path.includes('SHIPPED') ? `DL${String(700_000_000 + index * 7919)}` : null,
        carrier: path.includes('SHIPPED') ? 'Delhivery' : null,
        createdAt: placedAt,
        events: {
          create: path.map((status, step) => ({
            fromStatus: step === 0 ? null : path[step - 1],
            toStatus: status,
            note: status === 'CANCELLED' ? (spec.note ?? null) : null,
            createdAt: new Date(placedAt.getTime() + step * 20 * 3_600_000),
          })),
        },
        payments: {
          create: {
            provider: spec.cod ? 'COD' : 'MOCK',
            providerRef: `seed_${index}`,
            status:
              spec.status === 'PAYMENT_FAILED'
                ? 'FAILED'
                : spec.status === 'PENDING_PAYMENT'
                  ? 'PENDING'
                  : spec.status === 'REFUNDED'
                    ? 'REFUNDED'
                    : spec.cod
                      ? spec.status === 'DELIVERED'
                        ? 'SUCCEEDED'
                        : 'PENDING'
                      : wasPaid
                        ? 'SUCCEEDED'
                        : 'CREATED',
            amountMinor: pricing.totalMinor,
            currency: commerce.currency,
            method: spec.cod ? 'cash' : random.pick(['upi', 'card', 'netbanking']),
            failureReason:
              spec.status === 'PAYMENT_FAILED' ? 'The bank declined the payment.' : null,
            createdAt: placedAt,
          },
        },
        items: {
          create: lines.map((line) => {
            const itemLines = pricing.lines.filter(
              (priceLine) => priceLine.itemKey === line.pricingItem.key,
            );
            return {
              productId: line.product.id,
              variantId: line.variant.id,
              prescriptionId:
                line.lensConfig?.prescription?.mode === 'manual' &&
                spec.customer === 'asha@example.com'
                  ? ashaPrescription.id
                  : null,
              sku: line.variant.sku,
              productName: line.product.name,
              colourName: line.variant.colourName,
              imageUrl: line.variant.imageUrl,
              quantity: line.pricingItem.quantity,
              unitPriceMinor: line.pricingItem.unitPriceMinor,
              lensConfig: line.lensConfig ?? undefined,
              priceLines: toJson(itemLines),
              totalMinor: itemLines.reduce(
                (sum, priceLine) => sum + priceLine.amountMinor - priceLine.discountMinor,
                0,
              ),
            };
          }),
        },
      },
      include: { items: true, payments: true },
    });

    if (spec.status === 'REFUNDED') {
      const payment = order.payments[0];
      if (payment)
        await db.refund.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amountMinor: order.totalMinor,
            reason: 'Returned within 14 days',
            status: 'SUCCEEDED',
            providerRef: `seed_refund_${index}`,
          },
        });
    }
    if (couponRow && pricing.coupon?.applied) {
      await db.couponRedemption.create({
        data: {
          couponId: couponRow.id,
          orderId: order.id,
          userId,
          email,
          discountMinor: pricing.discountMinor,
        },
      });
      await db.coupon.update({
        where: { id: couponRow.id },
        data: { usageCount: { increment: 1 } },
      });
    }
    if (spec.status === 'DELIVERED' || spec.status === 'RETURN_REQUESTED') {
      for (const item of order.items)
        deliveredItems.push({
          orderItemId: item.id,
          productId: item.productId,
          userId,
          name:
            spec.customer === 'guest'
              ? 'Meera I.'
              : spec.customer === 'asha@example.com'
                ? 'Asha K.'
                : 'Rahul M.',
        });
    }
  }

  // Rahul's progressive prescription, sent after ordering, waiting for an optician.
  await db.prescription.create({
    data: {
      userId: users.get('rahul@example.com') ?? null,
      label: 'Reading and distance',
      values: prescriptionSchema.parse(rahulRx),
      status: 'PENDING_REVIEW',
    },
  });

  return deliveredItems;
}

/** Reviews: verified ones from delivered orders, then more across the catalogue. */
export async function seedReviews(
  db: Db,
  products: SeededProduct[],
  delivered: Awaited<ReturnType<typeof seedOrders>>,
  random: Random,
  now: Date,
) {
  let textIndex = 0;
  const nextText = () => {
    const text = reviewTexts[textIndex++ % reviewTexts.length];
    if (!text) throw new Error('No review texts to seed.');
    return text;
  };

  for (const item of delivered) {
    const text = nextText();
    await db.review.create({
      data: {
        productId: item.productId,
        userId: item.userId,
        orderItemId: item.orderItemId,
        authorName: item.name,
        ...text,
        rating: Math.max(4, text.rating),
        status: 'PUBLISHED',
        helpfulCount: random.int(0, 12),
        createdAt: new Date(now.getTime() - random.int(2, 15) * 86_400_000),
      },
    });
  }

  const frames = products
    .filter((product) => product.model !== null)
    .sort((a, b) => (b.model?.popularity ?? 0) - (a.model?.popularity ?? 0));
  for (const [rank, product] of frames.entries()) {
    const count = rank < 10 ? random.int(3, 5) : rank < 35 ? random.int(1, 3) : random.int(0, 1);
    for (let n = 0; n < count; n += 1) {
      await db.review.create({
        data: {
          productId: product.id,
          authorName: random.pick(reviewerNames),
          ...nextText(),
          status: random.next() < 0.08 ? 'PENDING' : 'PUBLISHED',
          helpfulCount: random.int(0, 30),
          createdAt: new Date(now.getTime() - random.int(5, 300) * 86_400_000),
        },
      });
    }
  }

  // Denormalised rating summary, from published reviews only.
  await db.$executeRaw`
    UPDATE "Product" p SET "ratingAverage" = s.avg, "ratingCount" = s.count
    FROM (SELECT "productId", ROUND(AVG(rating)::numeric, 1)::float AS avg, COUNT(*)::int AS count
          FROM "Review" WHERE status = 'PUBLISHED' GROUP BY "productId") s
    WHERE p.id = s."productId"`;
}
