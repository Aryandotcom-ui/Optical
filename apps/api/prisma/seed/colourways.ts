import type { ColourFamily, FrameFinish } from '@optical/shared/catalog';

/** A frame colour as sold: the swatch, its filter family and how it renders. */
export interface Colourway {
  name: string;
  family: ColourFamily;
  hex: string;
  finish: FrameFinish;
  secondaryHex?: string;
  hardwareHex?: string;
}

const SILVER = '#BFC3C8';
const GOLD = '#C9A45C';

export const colourways = {
  'jet-black': {
    name: 'Jet Black',
    family: 'black',
    hex: '#141416',
    finish: 'glossy',
    hardwareHex: SILVER,
  },
  'matte-black': {
    name: 'Matte Black',
    family: 'black',
    hex: '#232326',
    finish: 'matte',
    hardwareHex: '#6E6E73',
  },
  havana: {
    name: 'Havana Tortoise',
    family: 'tortoise',
    hex: '#7A4520',
    finish: 'tortoise',
    secondaryHex: '#2A160A',
    hardwareHex: GOLD,
  },
  'blonde-tortoise': {
    name: 'Blonde Tortoise',
    family: 'tortoise',
    hex: '#C09058',
    finish: 'tortoise',
    secondaryHex: '#6B3A14',
    hardwareHex: GOLD,
  },
  crystal: {
    name: 'Crystal Clear',
    family: 'clear',
    hex: '#E6ECEF',
    finish: 'crystal',
    hardwareHex: SILVER,
  },
  smoke: {
    name: 'Smoke Crystal',
    family: 'grey',
    hex: '#6B7075',
    finish: 'crystal',
    hardwareHex: SILVER,
  },
  sage: { name: 'Sage', family: 'green', hex: '#7D8C70', finish: 'matte', hardwareHex: SILVER },
  navy: {
    name: 'Deep Navy',
    family: 'blue',
    hex: '#1F2A44',
    finish: 'glossy',
    hardwareHex: SILVER,
  },
  wine: { name: 'Wine', family: 'red', hex: '#5E1F2A', finish: 'glossy', hardwareHex: GOLD },
  'rose-crystal': {
    name: 'Rose Crystal',
    family: 'pink',
    hex: '#D8A7A9',
    finish: 'crystal',
    hardwareHex: GOLD,
  },
  sand: { name: 'Sand', family: 'beige', hex: '#CDB99B', finish: 'matte', hardwareHex: GOLD },
  espresso: {
    name: 'Espresso',
    family: 'brown',
    hex: '#3C2719',
    finish: 'glossy',
    hardwareHex: GOLD,
  },
  'grey-fade': {
    name: 'Grey Fade',
    family: 'grey',
    hex: '#34373C',
    finish: 'gradient',
    secondaryHex: '#D6D8DB',
    hardwareHex: SILVER,
  },
  'honey-fade': {
    name: 'Honey Fade',
    family: 'brown',
    hex: '#7A4A22',
    finish: 'gradient',
    secondaryHex: '#E7CA9E',
    hardwareHex: GOLD,
  },
  gold: { name: 'Polished Gold', family: 'gold', hex: GOLD, finish: 'metallic' },
  'brushed-gold': { name: 'Brushed Gold', family: 'gold', hex: '#B8985C', finish: 'metallic' },
  silver: { name: 'Silver', family: 'silver', hex: SILVER, finish: 'metallic' },
  gunmetal: { name: 'Gunmetal', family: 'gunmetal', hex: '#4A4D52', finish: 'metallic' },
  'rose-gold': { name: 'Rose Gold', family: 'rose-gold', hex: '#C99A86', finish: 'metallic' },
  'matte-black-metal': { name: 'Matte Black', family: 'black', hex: '#26272A', finish: 'metallic' },
  'black-gold': {
    name: 'Black and Gold',
    family: 'black',
    hex: '#141416',
    finish: 'glossy',
    hardwareHex: GOLD,
  },
  'havana-gold': {
    name: 'Havana and Gold',
    family: 'tortoise',
    hex: '#7A4520',
    finish: 'tortoise',
    secondaryHex: '#2A160A',
    hardwareHex: GOLD,
  },
  'navy-silver': {
    name: 'Navy and Silver',
    family: 'blue',
    hex: '#1F2A44',
    finish: 'glossy',
    hardwareHex: SILVER,
  },
  'espresso-gold': {
    name: 'Espresso and Gold',
    family: 'brown',
    hex: '#3C2719',
    finish: 'glossy',
    hardwareHex: GOLD,
  },
  berry: { name: 'Berry', family: 'pink', hex: '#B8436F', finish: 'glossy', hardwareHex: SILVER },
  ocean: { name: 'Ocean', family: 'blue', hex: '#2A76B0', finish: 'glossy', hardwareHex: SILVER },
  lime: { name: 'Lime', family: 'green', hex: '#79A83B', finish: 'glossy', hardwareHex: SILVER },
  sunset: { name: 'Sunset', family: 'red', hex: '#C9453C', finish: 'glossy', hardwareHex: SILVER },
  tan: { name: 'Tan', family: 'brown', hex: '#A0703F', finish: 'matte' },
  grey: { name: 'Grey', family: 'grey', hex: '#8A8D91', finish: 'matte' },
} as const satisfies Record<string, Colourway>;

export type ColourwayCode = keyof typeof colourways;

/** Sunglass lens tints: the colour the renderer and PDP show through. */
export const sunTints = {
  grey: { name: 'grey lenses', hex: '#3E4146' },
  brown: { name: 'brown lenses', hex: '#5E3F2A' },
  green: { name: 'green lenses', hex: '#34503B' },
  blue: { name: 'blue lenses', hex: '#35506E' },
  rose: { name: 'rose gradient lenses', hex: '#9C5B63' },
} as const;

export type SunTintCode = keyof typeof sunTints;
