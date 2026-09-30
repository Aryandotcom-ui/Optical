import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source, so they are bundled in;
// third-party dependencies stay external and are installed in the image.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@optical\//],
});
