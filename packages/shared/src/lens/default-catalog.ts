import type { LensCatalog } from './catalog';

/**
 * The launch lens catalogue: prices in paise, tax-inclusive. The database
 * seed loads this; afterwards admin edits the database copy.
 */
export const defaultLensCatalog: LensCatalog = {
  purposes: [
    {
      code: 'zero-power',
      name: 'Zero power',
      description:
        'Clear lenses with no correction, for style or protection. Included with the frame.',
      basePriceMinor: 0,
      requiresPrescription: false,
      requiresAdd: false,
      includedCoatingCodes: [],
      defaultIndexCode: '1.56',
      defaultTintCode: 'clear',
    },
    {
      code: 'single-vision',
      name: 'Single vision',
      description: 'One prescription across the whole lens, for distance or for reading.',
      basePriceMinor: 1_190_00,
      requiresPrescription: true,
      requiresAdd: false,
      includedCoatingCodes: [],
      defaultIndexCode: '1.50',
      defaultTintCode: 'clear',
    },
    {
      code: 'progressive',
      name: 'Progressive',
      description:
        'Distance at the top, reading at the bottom and a smooth change in between, with no visible line.',
      basePriceMinor: 3_990_00,
      requiresPrescription: true,
      requiresAdd: true,
      includedCoatingCodes: [],
      defaultIndexCode: '1.56',
      defaultTintCode: 'clear',
    },
    {
      code: 'computer',
      name: 'Computer, no power',
      description: 'Zero-power lenses with a blue-light filter, for screen work.',
      basePriceMinor: 990_00,
      requiresPrescription: false,
      requiresAdd: false,
      includedCoatingCodes: ['blue-light'],
      defaultIndexCode: '1.56',
      defaultTintCode: 'clear',
    },
    {
      code: 'sun-rx',
      name: 'Prescription sunglasses',
      description: 'Single-vision lenses made to your prescription, with a sun tint.',
      basePriceMinor: 1_790_00,
      requiresPrescription: true,
      requiresAdd: false,
      includedCoatingCodes: ['uv400'],
      defaultIndexCode: '1.50',
      defaultTintCode: 'solid',
    },
  ],
  indexes: [
    {
      code: '1.50',
      refractiveIndex: 1.5,
      name: 'Standard 1.50',
      description: 'Our standard lens. Clear optics, best for low prescriptions.',
      priceMinor: 0,
      maxPower: 4,
      recommendedUpTo: 1.25,
    },
    {
      code: '1.56',
      refractiveIndex: 1.56,
      name: 'Mid-index 1.56',
      description: 'Slightly thinner and lighter than standard.',
      priceMinor: 400_00,
      maxPower: 6,
      recommendedUpTo: 2.5,
    },
    {
      code: '1.61',
      refractiveIndex: 1.61,
      name: 'Thin 1.61',
      description: 'About 25% thinner than standard. Strong enough for rimless frames.',
      priceMinor: 1_400_00,
      maxPower: 8,
      recommendedUpTo: 4.5,
    },
    {
      code: '1.67',
      refractiveIndex: 1.67,
      name: 'Extra thin 1.67',
      description: 'About 35% thinner than standard, for stronger prescriptions.',
      priceMinor: 2_900_00,
      maxPower: 10,
      recommendedUpTo: 7,
    },
    {
      code: '1.74',
      refractiveIndex: 1.74,
      name: 'Ultra thin 1.74',
      description: 'Our thinnest lens, about 45% thinner than standard, for high prescriptions.',
      priceMinor: 5_400_00,
      maxPower: 12,
      recommendedUpTo: 12,
    },
  ],
  coatings: [
    {
      code: 'scratch-resistant',
      name: 'Scratch-resistant',
      benefit: 'A hard coat that keeps everyday scuffs off the lens.',
      priceMinor: 290_00,
    },
    {
      code: 'uv400',
      name: 'UV400 protection',
      benefit: 'Blocks ultraviolet light up to 400 nm, the full UVA and UVB range.',
      priceMinor: 190_00,
    },
    {
      code: 'anti-reflective',
      name: 'Anti-reflective',
      benefit: 'Cuts reflections, so people see your eyes and headlights glare less at night.',
      priceMinor: 490_00,
    },
    {
      code: 'hydrophobic',
      name: 'Water and smudge repellent',
      benefit: 'Rain and fingerprints wipe off in one pass.',
      priceMinor: 390_00,
    },
    {
      code: 'blue-light',
      name: 'Blue-light filter',
      benefit:
        'Filters part of the blue-violet light from screens. Regular breaks help eye strain more; this is a comfort extra.',
      priceMinor: 690_00,
    },
  ],
  packages: [
    {
      code: 'essential',
      name: 'Essential',
      description: 'Scratch resistance and UV protection.',
      coatingCodes: ['scratch-resistant', 'uv400'],
      priceMinor: 390_00,
    },
    {
      code: 'complete',
      name: 'Complete',
      description:
        'Essential, plus anti-reflective and water and smudge repellent. Our most chosen option.',
      coatingCodes: ['scratch-resistant', 'uv400', 'anti-reflective', 'hydrophobic'],
      priceMinor: 990_00,
    },
    {
      code: 'premium',
      name: 'Premium',
      description: 'Everything in Complete, plus the blue-light filter.',
      coatingCodes: ['scratch-resistant', 'uv400', 'anti-reflective', 'hydrophobic', 'blue-light'],
      priceMinor: 1_490_00,
    },
  ],
  tints: [
    {
      code: 'clear',
      kind: 'clear',
      name: 'Clear',
      description: 'No tint.',
      priceMinor: 0,
      colours: [],
      supportsIntensity: false,
    },
    {
      code: 'photochromic',
      kind: 'photochromic',
      name: 'Photochromic',
      description:
        'Clear indoors, darkens in sunlight within about a minute. Darkens less behind a car windscreen.',
      priceMinor: 1_990_00,
      colours: [
        { code: 'grey', name: 'Grey', hex: '#4A4D52' },
        { code: 'brown', name: 'Brown', hex: '#6B4A32' },
        { code: 'green', name: 'Green', hex: '#3F5A45' },
      ],
      supportsIntensity: false,
    },
    {
      code: 'solid',
      kind: 'solid',
      name: 'Solid tint',
      description: 'An even tint across the whole lens. Choose the colour and strength.',
      priceMinor: 690_00,
      colours: [
        { code: 'grey', name: 'Grey', hex: '#4A4D52' },
        { code: 'brown', name: 'Brown', hex: '#6B4A32' },
        { code: 'green', name: 'Green', hex: '#3F5A45' },
        { code: 'blue', name: 'Blue', hex: '#35506E' },
        { code: 'rose', name: 'Rose', hex: '#9C5B63' },
      ],
      supportsIntensity: true,
    },
    {
      code: 'gradient',
      kind: 'gradient',
      name: 'Gradient tint',
      description:
        'Darker at the top, lighter at the bottom, so reading and dashboards stay easy to see.',
      priceMinor: 890_00,
      colours: [
        { code: 'grey', name: 'Grey', hex: '#4A4D52' },
        { code: 'brown', name: 'Brown', hex: '#6B4A32' },
        { code: 'blue', name: 'Blue', hex: '#35506E' },
      ],
      supportsIntensity: true,
    },
    {
      code: 'polarised',
      kind: 'polarised',
      name: 'Polarised',
      description:
        'Cuts glare reflected off water, roads and glass. Best for driving and the outdoors.',
      priceMinor: 1_990_00,
      colours: [
        { code: 'grey', name: 'Grey', hex: '#3E4146' },
        { code: 'brown', name: 'Brown', hex: '#5E3F2A' },
        { code: 'green', name: 'Green', hex: '#34503B' },
      ],
      supportsIntensity: false,
    },
  ],
  rules: [
    {
      id: 'sun-rx-needs-tint',
      when: [{ type: 'purpose-in', codes: ['sun-rx'] }],
      forbid: { type: 'tint', code: 'clear' },
      reason: 'Prescription sunglasses need a tint. Choose solid, gradient or polarised.',
    },
    {
      id: 'sun-rx-not-photochromic',
      when: [{ type: 'purpose-in', codes: ['sun-rx'] }],
      forbid: { type: 'tint', code: 'photochromic' },
      reason:
        'Photochromic lenses are clear indoors. For sunglasses, choose solid, gradient or polarised.',
    },
    {
      id: 'computer-not-polarised',
      when: [{ type: 'purpose-in', codes: ['computer'] }],
      forbid: { type: 'tint', code: 'polarised' },
      reason:
        'Polarised lenses make many screens look patchy or dark, so they are not offered for computer lenses.',
    },
    {
      id: 'rimless-no-150',
      when: [{ type: 'rim-type-in', rimTypes: ['rimless'] }],
      forbid: { type: 'index', code: '1.50' },
      reason:
        'Rimless frames are drilled through the lens, and 1.50 can crack at the holes. Choose 1.61 or thinner.',
    },
    {
      id: 'rimless-no-156',
      when: [{ type: 'rim-type-in', rimTypes: ['rimless'] }],
      forbid: { type: 'index', code: '1.56' },
      reason:
        'Rimless frames are drilled through the lens, and 1.56 can crack at the holes. Choose 1.61 or thinner.',
    },
    {
      id: 'progressive-lens-height',
      when: [{ type: 'lens-height-below', mm: 28 }],
      forbid: { type: 'purpose', code: 'progressive' },
      reason:
        'This frame is too shallow for progressive lenses. They need at least 28 mm of lens height to fit the reading zone.',
    },
    {
      id: 'polarised-not-174',
      when: [{ type: 'selected', option: { type: 'index', code: '1.74' } }],
      forbid: { type: 'tint', code: 'polarised' },
      reason: 'Polarised lenses are not made in 1.74. Choose 1.67 for the thinnest polarised lens.',
    },
  ],
};
