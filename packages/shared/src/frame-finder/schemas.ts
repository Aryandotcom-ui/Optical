import { z } from 'zod';
import { colourFamilies, faceShapes, frameMaterials } from '../catalog/constants';
import { productSummarySchema } from '../catalog/schemas';
import { finderBudgets, finderUses, finderVibes, type FinderAnswers } from './answers';

const vibes = Object.keys(finderVibes) as [
  keyof typeof finderVibes,
  ...(keyof typeof finderVibes)[],
];
const budgets = Object.keys(finderBudgets) as [
  keyof typeof finderBudgets,
  ...(keyof typeof finderBudgets)[],
];

export const finderAnswersSchema = z
  .object({
    faceShape: z.enum(faceShapes).nullable().default(null),
    faceWidthMm: z.number().min(100).max(200).nullable().default(null),
    vibes: z.array(z.enum(vibes)).max(4).default([]),
    use: z.enum(finderUses).nullable().default(null),
    budget: z.enum(budgets).nullable().default(null),
    materials: z.array(z.enum(frameMaterials)).max(5).default([]),
    colours: z.array(z.enum(colourFamilies)).max(colourFamilies.length).default([]),
  })
  .meta({ id: 'FinderAnswers' }) satisfies z.ZodType<FinderAnswers>;

const reasonSchema = z.discriminatedUnion('criterion', [
  z.object({ criterion: z.literal('shape'), faceShape: z.enum(faceShapes) }),
  z.object({ criterion: z.literal('size'), fit: z.literal('good') }),
  z.object({ criterion: z.literal('style'), tags: z.array(z.string()) }),
  z.object({ criterion: z.literal('budget') }),
  z.object({ criterion: z.literal('use'), use: z.enum(finderUses) }),
  z.object({ criterion: z.literal('material'), material: z.enum(frameMaterials) }),
  z.object({ criterion: z.literal('colour'), colour: z.enum(colourFamilies) }),
]);

export const finderResultsSchema = z
  .object({
    items: z.array(
      z.object({
        product: productSummarySchema,
        score: z.number().int().min(0).max(100),
        reasons: z.array(reasonSchema),
      }),
    ),
  })
  .meta({ id: 'FinderResults' });
export type FinderResults = z.infer<typeof finderResultsSchema>;
