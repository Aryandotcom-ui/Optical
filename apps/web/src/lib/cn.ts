import { clsx, type ClassValue } from 'clsx';

/**
 * Joins class names, dropping falsy values. It does not resolve conflicting
 * utilities (that library costs about 8 kB in every page's JavaScript), so
 * components never pass two utilities for the same property: they choose
 * with a ternary or a variant, and `className` on a primitive is for layout
 * additions such as margin, flex or position. See ADR-022.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
