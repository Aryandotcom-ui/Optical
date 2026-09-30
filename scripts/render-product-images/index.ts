/**
 * Renders studio product images for every frame variant in the database:
 *   pnpm render:images [--force] [--only=<slug>] [--jobs=<n>]
 *
 * Output: apps/web/public/renders/<slug>/<sku>-<view>.webp (transparent),
 * matching the ProductImage rows written by the seed. A manifest of input
 * hashes makes re-runs incremental. Generated files are git-ignored.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FrameFinish, FrameMaterial, FrameShape, RimType } from '@optical/shared/catalog';
import { build } from 'esbuild';
import pg from 'pg';
import { chromium, type Page } from 'playwright-core';
import sharp from 'sharp';
import type { RenderJob, View } from './browser';
import { loadRootEnv, repoRoot } from '../root-env';
import { findChromium, SOFTWARE_WEBGL_ARGS } from './chromium';

/** Bump when the renderer changes so every image is redrawn. */
const RENDERER_VERSION = 2;
const OUTPUT = { width: 1200, height: 900 };
/** Render at 1.5× and downscale, for smooth edges. */
const SUPERSAMPLE = 1.5;
const VIEWS: View[] = ['front', 'angle', 'side'];

loadRootEnv();
const root = repoRoot;
const outputDir = join(root, 'apps/web/public/renders');
const manifestPath = join(outputDir, 'manifest.json');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key ?? '', value ?? 'true'] as const;
  }),
);

interface VariantRow {
  slug: string;
  sku: string;
  shape: FrameShape;
  material: FrameMaterial;
  rimType: RimType;
  nosePads: boolean;
  lensWidthMm: number;
  lensHeightMm: number;
  bridgeMm: number;
  templeMm: number;
  totalWidthMm: number;
  finish: FrameFinish;
  swatchHex: string;
  secondaryHex: string | null;
  hardwareHex: string | null;
  lensTintHex: string | null;
}

async function loadVariants(): Promise<VariantRow[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set. Run pnpm run setup first.');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const only = args.get('only');
    const result = await client.query<VariantRow>(
      `SELECT p.slug, v.sku, f.shape, f.material, f."rimType", f."nosePads", f."lensWidthMm", f."lensHeightMm",
              f."bridgeMm", f."templeMm", f."totalWidthMm", v.finish, v."swatchHex", v."secondaryHex",
              v."hardwareHex", v."lensTintHex"
       FROM "ProductVariant" v
       JOIN "Product" p ON p.id = v."productId"
       JOIN "FrameSpec" f ON f."productId" = p.id
       WHERE p."deletedAt" IS NULL AND v."isActive" AND ($1::text IS NULL OR p.slug = $1)
       ORDER BY p.slug, v.position`,
      [only ?? null],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function jobFor(row: VariantRow, view: View): RenderJob {
  return {
    view,
    width: Math.round(OUTPUT.width * SUPERSAMPLE),
    height: Math.round(OUTPUT.height * SUPERSAMPLE),
    frame: {
      shape: row.shape,
      material: row.material,
      rimType: row.rimType,
      nosePads: row.nosePads,
      lensWidthMm: row.lensWidthMm,
      lensHeightMm: row.lensHeightMm,
      bridgeMm: row.bridgeMm,
      templeMm: row.templeMm,
      totalWidthMm: row.totalWidthMm,
    },
    material: {
      finish: row.finish,
      colorHex: row.swatchHex,
      secondaryHex: row.secondaryHex,
      ...(row.hardwareHex ? { hardwareHex: row.hardwareHex } : {}),
      lensTintHex: row.lensTintHex,
      lensTintStrength: 0.75,
    },
  };
}

async function bundleRenderer(): Promise<string> {
  const result = await build({
    entryPoints: [join(dirname(fileURLToPath(import.meta.url)), 'browser.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    write: false,
    minify: true,
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild produced no output');
  return output.text;
}

async function openPage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  script: string,
): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (error) => {
    console.error('Renderer error:', error.message);
  });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent"><script>${script}</script></body></html>`,
  );
  await page.waitForFunction(() => typeof window.renderFrame === 'function');
  return page;
}

async function main() {
  const executablePath = findChromium();
  if (!executablePath) {
    console.error(
      'No Chromium found. Run `pnpm setup:assets` to download one, or set CHROMIUM_PATH.',
    );
    process.exit(1);
  }
  const rows = await loadVariants();
  if (rows.length === 0) {
    console.error('No frame variants in the database. Run pnpm db:seed first.');
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });
  const manifest: Record<string, string> = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>)
    : {};
  const force = args.has('force');
  const pending = rows
    .flatMap((row) =>
      VIEWS.map((view) => {
        const job = jobFor(row, view);
        const file = join(outputDir, row.slug, `${row.sku.toLowerCase()}-${view}.webp`);
        const hash = createHash('sha256')
          .update(JSON.stringify({ RENDERER_VERSION, job }))
          .digest('hex')
          .slice(0, 16);
        const key = `${row.slug}/${row.sku.toLowerCase()}-${view}`;
        return { job, file, hash, key };
      }),
    )
    .filter((item) => force || manifest[item.key] !== item.hash || !existsSync(item.file));

  const total = rows.length * VIEWS.length;
  if (pending.length === 0) {
    console.log(`All ${total} product images are up to date.`);
    return;
  }
  console.log(`Rendering ${pending.length} of ${total} images with ${executablePath}`);

  const script = await bundleRenderer();
  const browser = await chromium.launch({ executablePath, args: SOFTWARE_WEBGL_ARGS });
  const workers = Math.max(1, Number(args.get('jobs') ?? 2));
  const started = Date.now();
  let done = 0;

  try {
    const queue = [...pending];
    await Promise.all(
      Array.from({ length: Math.min(workers, queue.length) }, async () => {
        const page = await openPage(browser, script);
        for (let item = queue.shift(); item; item = queue.shift()) {
          const dataUrl = await page.evaluate((job) => window.renderFrame(job), item.job);
          const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
          mkdirSync(dirname(item.file), { recursive: true });
          await sharp(png)
            .resize(OUTPUT.width, OUTPUT.height)
            .webp({ quality: 84, alphaQuality: 90, effort: 5 })
            .toFile(item.file);
          manifest[item.key] = item.hash;
          done += 1;
          if (done % 25 === 0 || done === pending.length) {
            const perImage = (Date.now() - started) / done;
            const remaining = Math.round(((pending.length - done) * perImage) / 1000);
            console.log(`  ${done}/${pending.length} images · about ${remaining} s left`);
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
          }
        }
        await page.close();
      }),
    );
  } finally {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    await browser.close();
  }
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(0)} s. Images are in apps/web/public/renders.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
