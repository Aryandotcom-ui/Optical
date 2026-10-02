import { z } from 'zod';
import { orderStatuses } from '../orders/state-machine';
import { prescriptionSchema } from '../rx/prescription';
import { addressSchema, emailSchema, phoneSchema } from './address';
import { paymentActionSchema, paymentOptionSchema, paymentProviderSchema } from './payment';
import { pricingSchema } from './pricing';

export const shippingSpeedSchema = z.enum(['standard', 'express']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const windowSchema = z.object({ earliest: isoDate, latest: isoDate });

export const checkoutQuoteRequestSchema = z
  .object({
    shippingSpeed: shippingSpeedSchema.default('standard'),
    postalCode: z.string().trim().max(12).optional(),
    paymentProvider: paymentProviderSchema.optional(),
    /** Lets first-order coupons be checked before the order is placed. */
    email: emailSchema.optional(),
  })
  .meta({ id: 'CheckoutQuoteRequest' });
export type CheckoutQuoteRequest = z.input<typeof checkoutQuoteRequestSchema>;

export const checkoutQuoteSchema = z
  .object({
    pricing: pricingSchema,
    delivery: z.object({ standard: windowSchema, express: windowSchema }),
    paymentOptions: z.array(paymentOptionSchema),
  })
  .meta({ id: 'CheckoutQuote' });
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;

export const placeOrderSchema = z
  .object({
    contact: z.object({ email: emailSchema, phone: phoneSchema() }),
    address: addressSchema,
    shippingSpeed: shippingSpeedSchema,
    paymentProvider: paymentProviderSchema,
    /** The total the customer agreed to. A different server total returns `PRICE_CHANGED`. */
    expectedTotalMinor: z.number().int().nonnegative(),
    note: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'PlaceOrder' });
export type PlaceOrder = z.input<typeof placeOrderSchema>;

export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}-\d{2}-\d{6}$/, 'Order numbers look like LO-26-001234.');

const prescriptionStateSchema = z.object({
  mode: z.enum(['manual', 'upload', 'saved', 'later']),
  /** True once values or a file are on the order item. */
  provided: z.boolean(),
  /** Progressive lenses also need the reading addition (ADD). */
  requiresAdd: z.boolean(),
});

/** The address as stored on an order (output only, so no input transforms). */
export const orderAddressSchema = z
  .object({
    fullName: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string(),
    region: z.string(),
    postalCode: z.string(),
    country: z.string(),
  })
  .meta({ id: 'OrderAddress' });

export const orderViewSchema = z
  .object({
    number: z.string(),
    status: z.enum(orderStatuses),
    statusLabel: z.string(),
    statusDescription: z.string(),
    placedAt: z.iso.datetime(),
    email: z.string(),
    paymentProvider: paymentProviderSchema,
    payment: z
      .object({
        id: z.uuid(),
        status: z.enum([
          'CREATED',
          'PENDING',
          'SUCCEEDED',
          'FAILED',
          'REFUNDED',
          'PARTIALLY_REFUNDED',
        ]),
        failureReason: z.string().nullable(),
      })
      .nullable(),
    /** True while a failed or unfinished payment can be tried again. */
    canRetryPayment: z.boolean(),
    /** When held stock is released if payment isn't completed. */
    reservedUntil: z.iso.datetime().nullable(),
    items: z.array(
      z.object({
        id: z.uuid(),
        productName: z.string(),
        productSlug: z.string(),
        colourName: z.string(),
        imageUrl: z.string().nullable(),
        quantity: z.number().int(),
        totalMinor: z.number().int(),
        /** Lens choices in words, e.g. ["Single vision", "1.61 Thin"]. */
        lensSummary: z.array(z.string()),
        prescription: prescriptionStateSchema.nullable(),
      }),
    ),
    totals: z.object({
      subtotalMinor: z.number().int(),
      discountMinor: z.number().int(),
      shippingMinor: z.number().int(),
      codFeeMinor: z.number().int(),
      taxMinor: z.number().int(),
      totalMinor: z.number().int(),
      taxName: z.string(),
      couponCode: z.string().nullable(),
    }),
    shippingAddress: orderAddressSchema,
    shippingSpeed: shippingSpeedSchema,
    estimatedDelivery: windowSchema.nullable(),
    awaitingPrescription: z.boolean(),
    timeline: z.array(
      z.object({ status: z.enum(orderStatuses), label: z.string(), at: z.iso.datetime() }),
    ),
    /** Steps still to come on the normal route to delivery. */
    upcoming: z.array(z.object({ status: z.enum(orderStatuses), label: z.string() })),
    shipment: z.object({ carrier: z.string(), trackingNumber: z.string() }).nullable(),
  })
  .meta({ id: 'OrderView' });
export type OrderView = z.infer<typeof orderViewSchema>;

export const placedOrderSchema = z
  .object({
    order: orderViewSchema,
    /** Grants access to this order's page; shown once, sent in the confirmation email. */
    accessToken: z.string(),
    /** Null when the payment provider couldn't be reached; the order page offers a retry. */
    payment: paymentActionSchema.nullable(),
    paymentError: z.string().nullable(),
  })
  .meta({ id: 'PlacedOrder' });
export type PlacedOrder = z.infer<typeof placedOrderSchema>;

export const trackOrderSchema = z
  .object({ number: orderNumberSchema, email: emailSchema })
  .meta({ id: 'TrackOrder' });

export const ORDER_TOKEN_HEADER = 'x-order-token';

export const retryPaymentSchema = z.object({
  provider: paymentProviderSchema.exclude(['cod']),
});

/** How a prescription arrives after the order is placed. */
export const attachPrescriptionSchema = z
  .object({
    itemId: z.uuid(),
    source: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('manual'), rx: prescriptionSchema }),
      z.object({ mode: z.literal('upload'), uploadId: z.uuid() }),
    ]),
  })
  .meta({ id: 'AttachPrescription' });
export type AttachPrescription = z.input<typeof attachPrescriptionSchema>;

export const uploadedPrescriptionSchema = z
  .object({
    id: z.uuid(),
    mime: z.string(),
    sizeBytes: z.number().int(),
    /** Short-lived private link for showing the upload back to the customer. */
    previewUrl: z.url(),
  })
  .meta({ id: 'UploadedPrescription' });
export type UploadedPrescription = z.infer<typeof uploadedPrescriptionSchema>;
