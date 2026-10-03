import 'server-only';
import { commerce } from '@optical/config/commerce';
import {
  marketSettingsFrom,
  publicSettingsSchema,
  type PublicSettings,
} from '@optical/shared/admin';
import { cache } from 'react';
import { apiRequest } from './api';

const { lowStockThreshold: _unused, ...defaults } = marketSettingsFrom(commerce);
const FALLBACK: PublicSettings = {
  market: defaults,
  flags: { virtualTryOn: true, frameFinder: true },
};

/**
 * The admin-editable store settings (delivery fees, free-delivery threshold,
 * feature switches), cached for 30 s. If the API is down the storefront
 * shows the code defaults, which are what checkout falls back to as well.
 */
export const getStoreSettings = cache(async (): Promise<PublicSettings> => {
  const result = await apiRequest('/v1/settings', publicSettingsSchema, {
    revalidate: 30,
    tags: ['settings'],
  });
  return result.ok ? result.data : FALLBACK;
});
