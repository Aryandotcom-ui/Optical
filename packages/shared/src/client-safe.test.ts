import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

/** Every module a file imports at runtime (type-only imports are erased, so they don't count). */
function runtimeImportGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)) {
    const specifier = match[1] ?? '';
    if (specifier.startsWith('.'))
      runtimeImportGraph(resolve(dirname(entry), `${specifier}.ts`), seen);
    else seen.add(specifier);
  }
  return seen;
}

/**
 * Entry points the storefront imports from browser code. Zod is about
 * 90 kB gzipped, so it must stay out of them; schemas belong on the server.
 */
describe.each([
  'catalog/lite.ts',
  'pricing/delivery.ts',
  'frame-geometry/index.ts',
  'lens/engine.ts',
  'money/index.ts',
  'face/index.ts',
  'frame-finder/index.ts',
])('%s', (entry) => {
  it('does not pull Zod into client bundles', () => {
    const graph = runtimeImportGraph(resolve(root, entry));
    expect([...graph].filter((module) => module === 'zod' || module.startsWith('zod/'))).toEqual(
      [],
    );
  });
});
