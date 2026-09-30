import type { CategorySlug, FaceShape, FrameMaterial, FrameShape } from '@optical/shared/catalog';
import type { ColourwayCode } from './colourways';
import type { FrameModel } from './frames';

export const categories: { slug: CategorySlug; name: string; description: string }[] = [
  {
    slug: 'eyeglasses',
    name: 'Eyeglasses',
    description: 'Frames for prescription, reading or zero-power lenses.',
  },
  {
    slug: 'sunglasses',
    name: 'Sunglasses',
    description: 'UV400 sunglasses, available with your prescription.',
  },
  {
    slug: 'computer-glasses',
    name: 'Computer glasses',
    description: 'Light frames for screen work, with or without power.',
  },
  {
    slug: 'kids',
    name: 'Kids',
    description: 'Flexible, durable frames sized for children from 4 to 12.',
  },
  { slug: 'accessories', name: 'Accessories', description: 'Cases, cleaning kits and cords.' },
];

export interface CollectionSeed {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  isFeatured: boolean;
  /** Which frames belong, in display order. */
  select: (models: FrameModel[]) => FrameModel[];
}

export const collectionSeeds: CollectionSeed[] = [
  {
    slug: 'everyday-classics',
    name: 'Everyday classics',
    tagline: 'Shapes that have worked for decades.',
    description: 'Rounds, wayfarers and soft squares in medium sizes: easy to wear, easy to keep.',
    isFeatured: true,
    select: (models) =>
      models.filter((m) => m.tags.includes('classic') && m.category === 'eyeglasses'),
  },
  {
    slug: 'featherweight',
    name: 'Featherweight',
    tagline: 'Fifteen grams or less.',
    description: 'Titanium, TR90 and fine metal frames you stop noticing within minutes.',
    isFeatured: true,
    select: (models) =>
      models
        .filter((m) => m.weightG <= 15 && m.category !== 'kids')
        .sort((a, b) => a.weightG - b.weightG),
  },
  {
    slug: 'titanium',
    name: 'Titanium',
    tagline: 'Light, strong and nickel-free.',
    description:
      'Our titanium frames are hypoallergenic, flex without snapping and weigh as little as 7 g.',
    isFeatured: false,
    select: (models) => models.filter((m) => m.material === 'titanium'),
  },
  {
    slug: 'sun-season',
    name: 'Sun season',
    tagline: 'UV400 on every pair.',
    description:
      'Sunglasses with full UV protection, and every shape available with your prescription.',
    isFeatured: true,
    select: (models) =>
      models.filter((m) => m.category === 'sunglasses').sort((a, b) => b.popularity - a.popularity),
  },
  {
    slug: 'screen-time',
    name: 'Screen time',
    tagline: 'For long days at a desk.',
    description:
      'Light, comfortable frames for screen work. Add a blue-light filter, or lenses with your prescription.',
    isFeatured: true,
    select: (models) => models.filter((m) => m.category === 'computer-glasses'),
  },
  {
    slug: 'statement',
    name: 'Statement',
    tagline: 'For when glasses are the outfit.',
    description: 'Cat-eyes, hexagons, browlines and oversized shapes.',
    isFeatured: false,
    select: (models) => models.filter((m) => m.tags.includes('statement')),
  },
];

/**
 * How well each frame shape suits each face shape (0–1), following the
 * usual optician guidance: contrast the face's dominant lines.
 */
export const faceShapeAffinity: Record<FrameShape, Record<FaceShape, number>> = {
  round: { oval: 0.8, round: 0.3, square: 0.9, heart: 0.6, oblong: 0.7, diamond: 0.8 },
  rectangle: { oval: 0.85, round: 0.9, square: 0.35, heart: 0.6, oblong: 0.5, diamond: 0.6 },
  square: { oval: 0.8, round: 0.9, square: 0.3, heart: 0.55, oblong: 0.6, diamond: 0.6 },
  aviator: { oval: 0.85, round: 0.65, square: 0.75, heart: 0.9, oblong: 0.6, diamond: 0.7 },
  'cat-eye': { oval: 0.8, round: 0.75, square: 0.6, heart: 0.85, oblong: 0.55, diamond: 0.9 },
  wayfarer: { oval: 0.85, round: 0.8, square: 0.5, heart: 0.6, oblong: 0.65, diamond: 0.7 },
  browline: { oval: 0.85, round: 0.75, square: 0.5, heart: 0.7, oblong: 0.6, diamond: 0.8 },
  hexagon: { oval: 0.8, round: 0.8, square: 0.6, heart: 0.7, oblong: 0.55, diamond: 0.65 },
};

const shapeCopy: Record<FrameShape, string> = {
  round: 'Round lenses soften strong jawlines and angular features.',
  rectangle: 'Rectangular lenses add structure to rounder faces and read as calm and focused.',
  square: 'Square lenses give definition to soft features and balance a rounded chin.',
  aviator: 'The aviator teardrop follows the curve of the cheekbone and balances a wider forehead.',
  'cat-eye': 'The lifted outer corner draws the eye upwards and flatters high cheekbones.',
  wayfarer: 'The wayfarer trapezoid is wider at the brow, which suits most face shapes.',
  browline: 'A strong brow line frames the eyes while the fine lower rim keeps the look light.',
  hexagon: 'Six soft facets add a little geometry without the hard edges of a square.',
};

const materialCopy: Record<FrameMaterial, { summary: string; care: string }> = {
  acetate: {
    summary:
      'Cut from plant-based cellulose acetate, polished by hand, with reinforced metal cores in the temples.',
    care: 'Acetate: rinse with lukewarm water and a drop of mild soap, dry with the microfibre cloth. Avoid hot cars and hairspray, which can dull the polish. Temples can be re-shaped with gentle heat by an optician.',
  },
  metal: {
    summary: 'Stainless steel with adjustable silicone nose pads and acetate temple tips.',
    care: 'Metal: wipe with the microfibre cloth; clean the nose pads now and then with warm soapy water. Pads can be adjusted by hand for a better fit.',
  },
  titanium: {
    summary:
      'Beta-titanium: light, strong, corrosion-resistant and free of nickel, so it suits sensitive skin.',
    care: 'Titanium: wipe with the microfibre cloth. The metal flexes, but bend the temples gently and never force the hinges past their stop.',
  },
  tr90: {
    summary: 'TR90 thermoplastic: flexible, very light and hard to break.',
    care: 'TR90: rinse with lukewarm water and dry with the microfibre cloth. The frame flexes, so it springs back from knocks. Keep it away from solvents.',
  },
  mixed: {
    summary:
      'An acetate brow on a stainless-steel lower rim and bridge, with adjustable nose pads.',
    care: 'Acetate and metal: rinse with lukewarm water and a drop of mild soap, dry with the microfibre cloth. Pads can be adjusted by an optician.',
  },
};

export function frameDescription(model: FrameModel): string {
  const size = `${model.mm[0]}–${model.mm[1]}–${model.mm[2]}`;
  return [
    `${model.name}. ${model.line}`,
    shapeCopy[model.shape],
    `${materialCopy[model.material].summary} Size ${size}, ${model.weightG} g.`,
  ].join(' ');
}

export function frameMaterialsAndCare(model: FrameModel): string {
  const lensNote =
    model.category === 'sunglasses'
      ? 'Lenses: UV400 protection as standard. Clean with lens spray and the microfibre cloth, never with a shirt or tissue, which scratch.'
      : 'Lenses: clean with lens spray and the microfibre cloth, never with a shirt or tissue, which scratch.';
  const warranty = 'Every frame comes with a 12-month warranty against manufacturing faults.';
  return `${materialCopy[model.material].care} ${lensNote} ${warranty}`;
}

// ─── Accessories ─────────────────────────────────────────────────────────────

export interface AccessorySeed {
  name: string;
  slug: string;
  price: number;
  colours: ColourwayCode[];
  description: string;
  care: string;
  popularity: number;
  tags: string[];
}

export const accessories: AccessorySeed[] = [
  {
    name: 'Hard case',
    slug: 'hard-case',
    price: 490,
    colours: ['matte-black', 'sand', 'navy'],
    description:
      'A slim clamshell case with a soft lining and a magnetic close. Fits every frame in the range.',
    care: 'Wipe the outside with a damp cloth. Shake out the lining now and then.',
    popularity: 70,
    tags: ['case'],
  },
  {
    name: 'Folding leather case',
    slug: 'folding-leather-case',
    price: 890,
    colours: ['tan', 'matte-black'],
    description: 'Vegetable-tanned leather that folds flat when empty, so it slips into a pocket.',
    care: 'Leather darkens with use. Keep it dry and condition it once a year.',
    popularity: 55,
    tags: ['case'],
  },
  {
    name: 'Lens care kit',
    slug: 'lens-care-kit',
    price: 299,
    colours: ['grey'],
    description:
      'A 60 ml alcohol-free lens spray and a large microfibre cloth. Safe on every coating we offer.',
    care: 'Wash the cloth by hand in mild soap and let it air dry. Skip fabric softener, which leaves streaks.',
    popularity: 82,
    tags: ['cleaning'],
  },
  {
    name: 'Microfibre cloths, set of 3',
    slug: 'microfibre-cloths',
    price: 199,
    colours: ['grey'],
    description: 'Three large microfibre cloths: one for home, one for the bag, one for the car.',
    care: 'Machine wash cold without fabric softener.',
    popularity: 64,
    tags: ['cleaning'],
  },
  {
    name: 'Adjustable glasses cord',
    slug: 'glasses-cord',
    price: 349,
    colours: ['matte-black', 'tan'],
    description:
      'A soft cotton cord with silicone ends that grip any temple. Keeps reading glasses close.',
    care: 'Hand wash in lukewarm water.',
    popularity: 40,
    tags: ['cord'],
  },
];

// ─── Help centre ─────────────────────────────────────────────────────────────

export const helpArticles: { slug: string; title: string; topic: string; body: string }[] = [
  {
    slug: 'how-to-read-your-prescription',
    topic: 'prescriptions',
    title: 'How to read your prescription',
    body: 'Your prescription has a row for each eye: OD is the right eye and OS the left. SPH (sphere) is the main power, minus for short sight and plus for long sight. CYL (cylinder) and AXIS correct astigmatism and always come together. ADD is the extra power for reading, used in progressive lenses. PD is the distance between your pupils in millimetres.',
  },
  {
    slug: 'measure-your-pd',
    topic: 'prescriptions',
    title: 'How to measure your PD',
    body: 'PD (pupillary distance) is often on your prescription. If it is not, use our PD tool with a card-sized reference, or ask a friend to measure from the centre of one pupil to the other while you look into the distance. Most adults are between 54 and 74 mm.',
  },
  {
    slug: 'send-prescription-later',
    topic: 'prescriptions',
    title: 'Can I send my prescription later?',
    body: 'Yes. Choose "Add later" when you configure your lenses. We hold your order and email you a secure upload link. Production starts once an optician has checked it.',
  },
  {
    slug: 'which-lens-index',
    topic: 'lenses',
    title: 'Which lens thickness should I choose?',
    body: 'For powers up to ±2.00, standard lenses look slim. Between ±2.25 and ±4.00, 1.61 lenses are noticeably thinner. Above ±4.00, choose 1.67 or 1.74. We recommend an index automatically based on your prescription, and show the edge thickness before you decide.',
  },
  {
    slug: 'blue-light-filter',
    topic: 'lenses',
    title: 'Do I need a blue-light filter?',
    body: 'A blue-light filter reduces some blue-violet light from screens and can make them feel less harsh. It does not replace breaks: the 20-20-20 rule (every 20 minutes, look 20 feet away for 20 seconds) helps eye strain more. We offer it as an option, never as a requirement.',
  },
  {
    slug: 'delivery-times',
    topic: 'delivery',
    title: 'How long does delivery take?',
    body: 'Frames without prescription lenses are dispatched within 2 working days. Prescription lenses are made to order and dispatched within 5 working days of your prescription being checked. Delivery then takes 2 to 4 working days in most of India, and a few days longer to remote areas.',
  },
  {
    slug: 'free-shipping',
    topic: 'delivery',
    title: 'Is shipping free?',
    body: 'Standard shipping is free on orders of ₹1,499 or more after discounts. Below that it costs ₹99. Express delivery costs ₹249, or ₹150 on top of free standard shipping. Remote areas have a ₹50 surcharge.',
  },
  {
    slug: 'returns',
    topic: 'returns',
    title: 'How do returns work?',
    body: 'You can return any order within 14 days of delivery for a full refund, including prescription lenses. Start a return from your account or the tracking page and we will arrange a free pickup.',
  },
  {
    slug: 'warranty',
    topic: 'returns',
    title: 'What does the warranty cover?',
    body: 'Every frame has a 12-month warranty against manufacturing faults such as loose hinges or peeling coatings. It does not cover accidental damage or normal wear.',
  },
  {
    slug: 'cash-on-delivery',
    topic: 'ordering',
    title: 'Can I pay cash on delivery?',
    body: 'Yes, for orders up to ₹15,000. A ₹49 handling fee applies. Prescription orders paid by cash on delivery still start production only after your prescription is checked.',
  },
  {
    slug: 'clean-your-glasses',
    topic: 'care',
    title: 'How to clean your glasses',
    body: 'Rinse under lukewarm water, add a drop of mild dish soap, rub gently, rinse again and dry with a clean microfibre cloth. Avoid shirts, tissues and paper towels, which scratch coatings over time.',
  },
  {
    slug: 'frame-size-guide',
    topic: 'ordering',
    title: 'How to choose your frame size',
    body: 'Look inside the temple of glasses that fit you: three numbers like 52-18-145 are the lens width, bridge width and temple length in millimetres. Frames within 2 mm of your current lens width and bridge will feel similar. Our size guide compares them for you.',
  },
];
