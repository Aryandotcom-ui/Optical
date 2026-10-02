import { z } from 'zod';
import { addressSchema, phoneSchema } from '../checkout/address';
import { orderStatuses } from '../orders/state-machine';
import { prescriptionSchema } from '../rx/prescription';

// ─── Saved addresses ────────────────────────────────────────────────────────

export const savedAddressSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string(),
    region: z.string(),
    postalCode: z.string(),
    country: z.string(),
    isDefault: z.boolean(),
  })
  .meta({ id: 'SavedAddress' });
export type SavedAddress = z.infer<typeof savedAddressSchema>;

export const addressInputSchema = addressSchema
  .extend({ phone: phoneSchema(), isDefault: z.boolean().default(false) })
  .meta({ id: 'AddressInput' });
export type AddressInput = z.input<typeof addressInputSchema>;

// ─── Saved prescriptions ───────────────────────────────────────────────────

/** How long before expiry a prescription is flagged and a reminder is sent. */
export const PRESCRIPTION_REMINDER_DAYS = 30;
/** Prescriptions without a date on them are treated as valid this long from saving. */
export const PRESCRIPTION_DEFAULT_VALIDITY_MONTHS = 24;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-15.');

export const savedPrescriptionSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    version: z.number().int(),
    values: prescriptionSchema.nullable(),
    hasFile: z.boolean(),
    status: z.enum(['PENDING_REVIEW', 'VERIFIED', 'NEEDS_CORRECTION']),
    prescribedAt: isoDate.nullable(),
    expiresAt: isoDate.nullable(),
    /** Expired, or expiring within the reminder window. */
    expiry: z.enum(['valid', 'expiring', 'expired', 'unknown']),
    createdAt: z.iso.datetime(),
    /** Earlier versions of this prescription, newest first. */
    history: z.array(
      z.object({ id: z.uuid(), version: z.number().int(), createdAt: z.iso.datetime() }),
    ),
  })
  .meta({ id: 'SavedPrescription' });
export type SavedPrescription = z.infer<typeof savedPrescriptionSchema>;

export const prescriptionInputSchema = z
  .object({
    label: z.string().trim().min(1, 'Give it a name, like "Reading glasses".').max(60),
    rx: prescriptionSchema,
    prescribedAt: isoDate.nullable().default(null),
    expiresAt: isoDate.nullable().default(null),
  })
  .meta({ id: 'PrescriptionInput' });
export type SavedPrescriptionInput = z.input<typeof prescriptionInputSchema>;

// ─── Orders ─────────────────────────────────────────────────────────────────

export const orderSummarySchema = z
  .object({
    number: z.string(),
    status: z.enum(orderStatuses),
    statusLabel: z.string(),
    placedAt: z.iso.datetime(),
    totalMinor: z.number().int(),
    itemCount: z.number().int(),
    itemNames: z.array(z.string()),
    imageUrl: z.string().nullable(),
  })
  .meta({ id: 'OrderSummary' });
export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderListSchema = z.object({
  items: z.array(orderSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type OrderList = z.infer<typeof orderListSchema>;

export const returnReasons = ['fit', 'style', 'vision', 'damaged', 'wrong-item', 'other'] as const;
export const returnRequestSchema = z
  .object({
    reason: z.enum(returnReasons),
    note: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'ReturnRequest' });
export type ReturnRequest = z.input<typeof returnRequestSchema>;

export const cancelRequestSchema = z.object({ note: z.string().trim().max(500).optional() });

export const reorderResultSchema = z.object({
  added: z.number().int(),
  /** Items that couldn't be added again, with the reason. */
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});
export type ReorderResult = z.infer<typeof reorderResultSchema>;

// ─── Wishlist ───────────────────────────────────────────────────────────────

export const wishlistSchema = z
  .object({
    items: z.array(z.object({ id: z.uuid(), slug: z.string() })),
    /** Read-only share link token. */
    shareToken: z.string(),
  })
  .meta({ id: 'Wishlist' });
export type Wishlist = z.infer<typeof wishlistSchema>;

export const wishlistMergeSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), slug: z.string().max(80) })).max(100),
});
