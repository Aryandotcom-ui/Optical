import { z } from 'zod';
import {
  categorySlugs,
  colourFamilies,
  faceShapes,
  frameFeatures,
  frameFinishes,
  frameFits,
  frameMaterials,
  frameShapes,
  frameSizes,
  hingeTypes,
  listingSorts,
  productTypes,
  rimTypes,
  reviewSorts,
} from './constants';

export * from './constants';

/** Zod schemas for the catalogue vocabularies in constants.ts. */
export const categorySlugSchema = z.enum(categorySlugs);
export const productTypeSchema = z.enum(productTypes);
export const frameShapeSchema = z.enum(frameShapes);
export const frameMaterialSchema = z.enum(frameMaterials);
export const rimTypeSchema = z.enum(rimTypes);
export const hingeTypeSchema = z.enum(hingeTypes);
export const frameFinishSchema = z.enum(frameFinishes);
export const frameSizeSchema = z.enum(frameSizes);
export const frameFitSchema = z.enum(frameFits);
export const frameFeatureSchema = z.enum(frameFeatures);
export const faceShapeSchema = z.enum(faceShapes);
export const colourFamilySchema = z.enum(colourFamilies);
export const listingSortSchema = z.enum(listingSorts);
export const reviewSortSchema = z.enum(reviewSorts);
