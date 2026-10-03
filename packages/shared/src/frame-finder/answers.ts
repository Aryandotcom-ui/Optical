import type { ColourFamily, FaceShape, FrameMaterial } from '../catalog/constants';

/** The style vibes offered in step 2, and the catalogue style tags each one means. */
export const finderVibes = {
  classic: ['classic', 'professional', 'everyday'],
  minimal: ['minimal', 'lightweight'],
  retro: ['retro'],
  bold: ['bold', 'statement'],
} as const satisfies Record<string, readonly string[]>;
export type FinderVibe = keyof typeof finderVibes;

/** Step 3: what the glasses are mostly for. */
export const finderUses = ['everyday', 'screens', 'outdoors', 'active'] as const;
export type FinderUse = (typeof finderUses)[number];

/** Step 4: price bands in minor units (paise), inclusive; null means no limit. */
export const finderBudgets = {
  value: { minMinor: 0, maxMinor: 2_500_00 },
  mid: { minMinor: 2_500_00, maxMinor: 4_000_00 },
  premium: { minMinor: 4_000_00, maxMinor: null },
} as const satisfies Record<string, { minMinor: number; maxMinor: number | null }>;
export type FinderBudget = keyof typeof finderBudgets;

/** Everything the Frame Finder asked. Every step can be skipped. */
export interface FinderAnswers {
  faceShape: FaceShape | null;
  /** Measured with the camera, when the customer chose to. */
  faceWidthMm: number | null;
  vibes: FinderVibe[];
  use: FinderUse | null;
  budget: FinderBudget | null;
  materials: FrameMaterial[];
  colours: ColourFamily[];
}

export const emptyFinderAnswers: FinderAnswers = {
  faceShape: null,
  faceWidthMm: null,
  vibes: [],
  use: null,
  budget: null,
  materials: [],
  colours: [],
};
