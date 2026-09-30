import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  categorySlugs,
  colourFamilies,
  faceShapes,
  frameFeatures,
  frameFinishes,
  frameFits,
  frameMaterials,
  frameShapes,
  hingeTypes,
  imageKinds,
  productTypes,
  rimTypes,
} from '@optical/shared/catalog';
import { couponKinds } from '@optical/shared/pricing';
import { tintKinds } from '@optical/shared/lens';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(import.meta.dirname, '../prisma/migrations');
const sql = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
  .join('\n');

/** The quoted values in the latest `CHECK (... IN (...))` or `ARRAY[...]` of a named constraint. */
function checkValues(constraint: string): string[] {
  const matches = [
    ...sql.matchAll(new RegExp(`"${constraint}"\\s+CHECK\\s*\\(([\\s\\S]*?)\\);`, 'g')),
  ];
  const body = matches.at(-1)?.[1];
  if (!body) throw new Error(`Constraint ${constraint} not found in migrations`);
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe('database vocab constraints match the shared enums', () => {
  it.each([
    ['Category_slug_check', categorySlugs],
    ['Product_type_check', productTypes],
    ['Product_fit_check', frameFits],
    ['FrameSpec_shape_check', frameShapes],
    ['FrameSpec_material_check', frameMaterials],
    ['FrameSpec_rimType_check', rimTypes],
    ['FrameSpec_hinge_check', hingeTypes],
    ['FrameSpec_features_check', frameFeatures],
    ['FaceShapeAffinity_faceShape_check', faceShapes],
    ['ProductVariant_colourFamily_check', colourFamilies],
    ['ProductVariant_finish_check', frameFinishes],
    ['ProductImage_kind_check', imageKinds],
    ['LensTint_kind_check', tintKinds],
    ['Coupon_kind_check', couponKinds],
  ] as const)('%s', (constraint, values) => {
    expect([...checkValues(constraint)].sort()).toEqual([...values].sort());
  });
});
