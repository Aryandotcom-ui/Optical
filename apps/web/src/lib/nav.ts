import 'server-only';
import { frameShapes, type CategorySlug, type FrameShape } from '@optical/shared/catalog';
import { getCategories, getCollections } from './catalog';

export interface NavModel {
  categories: { slug: CategorySlug; name: string; description: string }[];
  shapes: FrameShape[];
  collections: { slug: string; name: string; tagline: string }[];
}

/**
 * Navigation built from live catalogue data, so menus never link to an
 * empty category or a retired collection. Falls back to an empty model if
 * the API is down; the shell still renders.
 */
export async function getNavModel(): Promise<NavModel> {
  try {
    const [categories, collections] = await Promise.all([getCategories(), getCollections()]);
    return {
      categories: categories.filter((category) => category.productCount > 0),
      shapes: [...frameShapes],
      collections: collections.filter((collection) => collection.productCount > 0),
    };
  } catch {
    return { categories: [], shapes: [...frameShapes], collections: [] };
  }
}
