import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a text colour and a custom font size together', () => {
    expect(cn('text-on-accent', 'text-body-lg')).toBe('text-on-accent text-body-lg');
  });

  it('resolves conflicts within the custom type scale', () => {
    expect(cn('text-body', 'text-caption')).toBe('text-caption');
  });

  it('resolves conflicts between colour tokens', () => {
    expect(cn('text-ink', 'text-ink-secondary')).toBe('text-ink-secondary');
  });

  it('resolves conflicts within the custom radius scale', () => {
    expect(cn('rounded-card', 'rounded-pill')).toBe('rounded-pill');
  });

  it('drops falsy values', () => {
    expect(cn('px-4', false, undefined, null, 'py-2')).toBe('px-4 py-2');
  });
});
