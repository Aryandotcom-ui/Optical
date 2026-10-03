'use client';

import { PD_RANGE_MM } from '@optical/shared/face';
import { createLocalValue } from '@/lib/local-value';

/**
 * The customer's PD (in mm) once they have measured or entered it, kept
 * only in this browser. Try-on uses it to draw frames at their true size.
 */
export const savedPd = createLocalValue<number | null>(
  'my-pd',
  (raw) => (typeof raw === 'number' && raw >= PD_RANGE_MM[0] && raw <= PD_RANGE_MM[1] ? raw : null),
  null,
);
