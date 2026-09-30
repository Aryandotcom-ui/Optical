import { describe, expect, it } from 'vitest';
import messages from '../messages/en.json';

function flatten(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  throw new Error(`Unexpected message value at ${prefix}`);
}

const entries = flatten(messages);

describe('English copy', () => {
  it.each(entries)('%s follows the house style', (_key, text) => {
    // Calm, confident copy: no exclamation marks, no filler.
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b/i);
    expect(text.trim()).toBe(text);
    expect(text.length).toBeGreaterThan(0);
  });

  it('never hard-codes the brand name', () => {
    const brandLike = entries.filter(([, text]) => /lumen/i.test(text));
    expect(brandLike).toEqual([]);
  });
});
