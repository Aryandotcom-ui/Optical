/* eslint-disable no-console -- a CLI script whose output is the point */
import { defaultFeatureFlags } from '@optical/config/flags';
import { commerce } from '@optical/config/commerce';
import { nodeEnvSchema, parseEnv } from '@optical/config/env';
import { z } from 'zod';
import { loadDotEnvFile } from '../../src/config/env';
import { hashPassword } from '../../src/lib/password';
import { createPrismaClient, type Db } from '../../src/infra/prisma';
import { seedCatalog } from './catalog';
import { seedOrders, seedReviews } from './orders';
import { demoAddresses, demoUsers } from './people';
import { toJson } from './json';
import { createRandom } from './random';

/** The seed needs only a database; it must not require the API's other settings. */
const seedEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  }),
  SEED_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  SEED_ALLOW_PRODUCTION: z.enum(['true', 'false']).optional(),
});

/** Fixed "today" so the seed is identical on every run and machine. */
const SEED_NOW = new Date('2026-09-15T06:30:00Z');

async function wipe(db: Db) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  if (list) await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await db.$executeRawUnsafe('ALTER SEQUENCE order_number_seq RESTART WITH 1001');
}

async function seedPeople(db: Db) {
  const ids = new Map<string, string>();
  for (const user of demoUsers) {
    const created = await db.user.create({
      data: {
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        passwordHash: await hashPassword(user.password),
        emailVerifiedAt: SEED_NOW,
        createdAt: new Date(SEED_NOW.getTime() - 200 * 86_400_000),
      },
    });
    ids.set(user.email, created.id);
  }
  for (const [email, address] of Object.entries(demoAddresses)) {
    const userId = ids.get(email);
    if (userId) await db.address.create({ data: { ...address, userId, isDefault: true } });
  }
  return ids;
}

async function seedPromotions(db: Db) {
  await db.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        description: '10% off your first order, up to ₹500.',
        kind: 'percentage',
        percentBasisPoints: 1000,
        maxDiscountMinor: 500_00,
        firstOrderOnly: true,
        perCustomerLimit: 1,
      },
      {
        code: 'FREESHIP',
        description: 'Free standard shipping on any order.',
        kind: 'free-shipping',
      },
      {
        code: 'FLAT300',
        description: '₹300 off orders of ₹2,999 or more.',
        kind: 'fixed',
        amountMinor: 300_00,
        minSubtotalMinor: 2_999_00,
        usageLimit: 500,
      },
      {
        code: 'MONSOON15',
        description: '15% off, up to ₹750. Ended 31 August 2026.',
        kind: 'percentage',
        percentBasisPoints: 1500,
        maxDiscountMinor: 750_00,
        endsAt: new Date('2026-09-01T00:00:00+05:30'),
      },
    ],
  });
}

async function seedSettings(db: Db) {
  const descriptions: Record<string, string> = {
    googleOAuth: 'Sign in with Google (needs OAuth credentials).',
    analytics: 'Privacy-respecting analytics, after cookie consent.',
    errorReporting: 'Send errors to the configured reporting service.',
    virtualTryOn: 'Camera-based virtual try-on.',
    frameFinder: 'Guided frame recommendation quiz.',
    cashOnDelivery: 'Offer cash on delivery at checkout.',
    devTools: 'Developer pages under /dev (never shown in production).',
  };
  await db.featureFlag.createMany({
    data: Object.entries(defaultFeatureFlags).map(([key, enabled]) => ({
      key,
      enabled,
      description: descriptions[key] ?? key,
    })),
  });
  await db.setting.createMany({
    data: [
      { key: 'tax', value: toJson(commerce.tax) },
      { key: 'shipping', value: toJson(commerce.shipping) },
      { key: 'cashOnDelivery', value: toJson(commerce.cashOnDelivery) },
      { key: 'policies', value: toJson(commerce.policies) },
    ],
  });
}

async function main() {
  loadDotEnvFile();
  const env = parseEnv('seed', seedEnvSchema, process.env);
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Refusing to seed a production database. The seed deletes all data.');
  }
  const db = createPrismaClient(env.SEED_DATABASE_URL ?? env.DATABASE_URL, { maxConnections: 4 });
  const random = createRandom(20260915);
  const started = Date.now();

  try {
    await wipe(db);
    const users = await seedPeople(db);
    await seedPromotions(db);
    await seedSettings(db);
    const products = await seedCatalog(db, random, SEED_NOW);
    const delivered = await seedOrders(db, products, users, random, SEED_NOW);
    await seedReviews(db, products, delivered, random, SEED_NOW);

    const asha = users.get('asha@example.com');
    const favourites = products.filter((product) =>
      ['orla', 'zephyr', 'tamsin'].includes(product.slug),
    );
    if (asha) {
      await db.wishlist.create({
        data: {
          userId: asha,
          shareToken: 'demo-asha-wishlist',
          items: { create: favourites.map((product) => ({ productId: product.id })) },
        },
      });
    }

    const [frames, variants, reviews, orders] = await Promise.all([
      db.product.count({ where: { type: 'frame' } }),
      db.productVariant.count(),
      db.review.count(),
      db.order.count(),
    ]);
    console.log(`\nSeeded in ${((Date.now() - started) / 1000).toFixed(1)} s:`);
    console.log(
      `  ${frames} frames and ${products.length - frames} accessories, ${variants} colour variants`,
    );
    console.log(`  ${orders} sample orders across every status, ${reviews} reviews, 4 coupons`);
    console.log('\nDemo accounts (local development only):');
    for (const user of demoUsers)
      console.log(`  ${user.role.padEnd(8)} ${user.email.padEnd(20)} ${user.password}`);
    console.log('\nProduct images are generated separately: pnpm render:images\n');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
