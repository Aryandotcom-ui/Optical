import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class names in order', () => {
    expect(cn('text-on-accent', 'text-body-lg')).toBe('text-on-accent text-body-lg');
  });

  it('drops falsy values', () => {
    expect(cn('px-4', false, undefined, null, 'py-2')).toBe('px-4 py-2');
  });

  it('supports conditional objects and arrays', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b');
  });
});
