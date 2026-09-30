import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know the custom type scale from the design tokens;
 * otherwise it reads `text-body-lg` as a colour and drops `text-on-accent`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display-xl',
        'display-lg',
        'display-md',
        'title',
        'headline',
        'body-lg',
        'body',
        'caption',
      ],
      radius: ['control', 'card', 'media', 'pill'],
    },
  },
});

/** Joins class names and resolves conflicting Tailwind utilities (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
