import { z } from 'zod';
import {
  categorySlugs,
  colourFamilies,
  faceShapes,
  frameFinishes,
  frameFits,
  frameMaterials,
  frameShapes,
  rimTypes,
} from '../catalog/constants';
import { orderStatuses } from '../orders/state-machine';
import { adminAreas } from './permissions';

const minor = z.number().int().min(0).max(10_000_000_00);
const slug = z.string().regex(/^[a-z0-9-]{1,80}$/, 'Use lowercase letters, numbers and hyphens.');
const text = (max: number) => z.string().trim().min(1).max(max);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1a2b3c.');

/** Every admin list: server-side paging, one sort column, a search box, CSV export. */
export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  q: z.string().trim().max(120).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
  format: z.enum(['json', 'csv']).default('json'),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminMeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['STAFF', 'ADMIN']),
  areas: z.array(z.object({ area: z.enum(adminAreas), write: z.boolean() })),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

// ─── Products ──────────────────────────────────────────────────────────────

export const productCreateSchema = z.object({
  name: text(80),
  slug,
  categorySlug: z.enum(categorySlugs),
  type: z.enum(['frame', 'accessory']),
  basePriceMinor: minor,
  description: text(4000),
});
export type ProductCreate = z.infer<typeof productCreateSchema>;

export const frameSpecInputSchema = z.object({
  shape: z.enum(frameShapes),
  lensWidthMm: z.number().min(20).max(80),
  lensHeightMm: z.number().min(15).max(70),
  bridgeMm: z.number().min(8).max(30),
  templeMm: z.number().min(100).max(170),
  totalWidthMm: z.number().min(90).max(180),
  weightG: z.number().min(1).max(200),
  material: z.enum(frameMaterials),
  rimType: z.enum(rimTypes),
});

export const productUpdateSchema = z
  .object({
    name: text(80),
    description: text(4000),
    materialsAndCare: z.string().trim().max(2000),
    basePriceMinor: minor,
    fit: z.enum(frameFits).nullable(),
    styleTags: z.array(z.string().trim().min(1).max(30)).max(12),
    faceShapes: z.array(
      z.object({ faceShape: z.enum(faceShapes), score: z.number().min(0).max(1) }),
    ),
    seoTitle: z.string().trim().max(70).nullable(),
    seoDescription: z.string().trim().max(160).nullable(),
    isPublished: z.boolean(),
    lensesAvailable: z.boolean(),
    frame: frameSpecInputSchema,
  })
  .partial();
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

export const productBulkSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.enum(['publish', 'unpublish', 'archive']),
});

export const variantInputSchema = z.object({
  sku: z.string().regex(/^[A-Z0-9-]{3,40}$/, 'Use capitals, numbers and hyphens.'),
  colourName: text(40),
  colourFamily: z.enum(colourFamilies),
  swatchHex: hex,
  finish: z.enum(frameFinishes).default('glossy'),
  priceOverrideMinor: minor.nullable().default(null),
  isActive: z.boolean().default(true),
});
export const variantUpdateSchema = variantInputSchema.partial();

/** Which view an uploaded image shows; the storefront picks images by kind. */
export const imageKinds = ['front', 'angle', 'side', 'on-face', 'detail'] as const;

export const imageOrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(60) });

// ─── Inventory ────────────────────────────────────────────────────────────

export const stockAdjustSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((value) => value !== 0, 'Enter a change other than zero.'),
  reason: text(200),
});
export const stockThresholdSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(1000),
});

// ─── Lens catalogue ───────────────────────────────────────────────────────

export const lensKinds = ['purposes', 'indexes', 'coatings', 'packages', 'tints'] as const;
export type LensKind = (typeof lensKinds)[number];
export const lensOptionUpdateSchema = z
  .object({
    name: text(60),
    description: text(400),
    priceMinor: minor,
    sortOrder: z.number().int().min(0).max(1000),
    isActive: z.boolean(),
  })
  .partial();
export const lensRuleUpdateSchema = z
  .object({ reason: text(300), isActive: z.boolean() })
  .partial();

// ─── Orders and prescriptions ─────────────────────────────────────────────

export const orderTransitionSchema = z.object({
  to: z.enum(orderStatuses),
  note: z.string().trim().max(500).optional(),
  visibleToCustomer: z.boolean().default(true),
});
export const orderUpdateSchema = z
  .object({
    internalNote: z.string().trim().max(2000).nullable(),
    carrier: z.string().trim().max(60).nullable(),
    trackingNumber: z.string().trim().max(60).nullable(),
  })
  .partial();
export const orderRefundSchema = z.object({ amountMinor: minor.min(1), reason: text(300) });

/** Templated reasons for asking a customer to correct a prescription. */
export const correctionTemplates = {
  unreadable:
    'We could not read the photo or file clearly. Please upload a sharper, well-lit copy.',
  'missing-pd': 'Your prescription does not show a pupillary distance (PD). Please add it.',
  expired:
    'This prescription has expired. Please upload one from an eye test in the last two years.',
  mismatch: 'The values you typed do not match the uploaded prescription. Please check them.',
  other: '',
} as const;
export type CorrectionTemplate = keyof typeof correctionTemplates;

export const prescriptionReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), note: z.string().trim().max(500).optional() }),
  z.object({
    decision: z.literal('correction'),
    template: z.enum(
      Object.keys(correctionTemplates) as [CorrectionTemplate, ...CorrectionTemplate[]],
    ),
    note: z.string().trim().max(500).optional(),
  }),
]);
export type PrescriptionReview = z.infer<typeof prescriptionReviewSchema>;

// ─── Customers, coupons, reviews, help ─────────────────────────────────────

export const roleUpdateSchema = z.object({ role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']) });

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,20}$/, 'Use 3–20 letters or numbers.'),
    description: text(200),
    kind: z.enum(['percentage', 'fixed', 'free-shipping']),
    percentBasisPoints: z.number().int().min(1).max(10_000).nullable().default(null),
    amountMinor: minor.nullable().default(null),
    maxDiscountMinor: minor.nullable().default(null),
    minSubtotalMinor: minor.default(0),
    firstOrderOnly: z.boolean().default(false),
    active: z.boolean().default(true),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    usageLimit: z.number().int().min(1).nullable().default(null),
    perCustomerLimit: z.number().int().min(1).nullable().default(null),
  })
  .refine((c) => c.kind !== 'percentage' || c.percentBasisPoints !== null, {
    message: 'Percentage coupons need a percentage.',
    path: ['percentBasisPoints'],
  })
  .refine((c) => c.kind !== 'fixed' || c.amountMinor !== null, {
    message: 'Fixed coupons need an amount.',
    path: ['amountMinor'],
  });
export const couponUpdateSchema = z.object({
  description: text(200).optional(),
  active: z.boolean().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
});

export const reviewModerationSchema = z.object({ status: z.enum(['PUBLISHED', 'REJECTED']) });

export const helpTopics = [
  'ordering',
  'prescriptions',
  'lenses',
  'delivery',
  'returns',
  'care',
] as const;
export const helpArticleInputSchema = z.object({
  slug,
  title: text(120),
  topic: z.enum(helpTopics),
  body: text(10_000),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isPublished: z.boolean().default(true),
});
export const helpArticleUpdateSchema = helpArticleInputSchema.partial();

export const flagUpdateSchema = z.object({ enabled: z.boolean() });
