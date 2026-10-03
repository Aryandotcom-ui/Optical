import { type FrameFeature } from '@optical/shared/catalog';
import { defaultLensCatalog } from '@optical/shared/lens';
import type { Db } from '../../src/infra/prisma';
import { colourways, sunTints, type ColourwayCode, type SunTintCode } from './colourways';
import {
  accessories,
  categories,
  collectionSeeds,
  faceShapeAffinity,
  frameDescription,
  frameMaterialsAndCare,
  helpArticles,
} from './content';
import { frameModels, type FrameModel } from './frames';
import type { Random } from './random';

export const RENDER_WIDTH = 1200;
export const RENDER_HEIGHT = 900;
const renderKinds = [
  ['front', 'front view'],
  ['angle', 'three-quarter view'],
  ['side', 'side view'],
] as const;

export interface SeededVariant {
  id: string;
  sku: string;
  colourName: string;
  imageUrl: string;
}
export interface SeededProduct {
  id: string;
  slug: string;
  name: string;
  priceMinor: number;
  model: FrameModel | null;
  variants: SeededVariant[];
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function stockFor(random: Random): number {
  const roll = random.next();
  if (roll < 0.06) return 0;
  if (roll < 0.14) return random.int(1, 3);
  return random.int(8, 60);
}

function featuresFor(model: FrameModel, nosePads: boolean): FrameFeature[] {
  const features: FrameFeature[] = [];
  if (model.springHinges) features.push('spring-hinges');
  if (nosePads) features.push('nose-pads', 'adjustable');
  if (model.weightG <= 15) features.push('lightweight');
  return features;
}

async function seedLensCatalogue(db: Db) {
  const catalog = defaultLensCatalog;
  await db.lensPurpose.createMany({
    data: catalog.purposes.map((option, sortOrder) => ({ ...option, sortOrder })),
  });
  await db.lensIndexOption.createMany({
    data: catalog.indexes.map((option, sortOrder) => ({ ...option, sortOrder })),
  });
  await db.lensCoating.createMany({
    data: catalog.coatings.map((option, sortOrder) => ({ ...option, sortOrder })),
  });
  await db.lensPackage.createMany({
    data: catalog.packages.map((option, sortOrder) => ({ ...option, sortOrder })),
  });
  await db.lensTint.createMany({
    data: catalog.tints.map((option, sortOrder) => ({ ...option, sortOrder })),
  });
  await db.lensRule.createMany({
    data: catalog.rules.map((rule) => ({
      id: rule.id,
      when: rule.when,
      forbid: rule.forbid,
      reason: rule.reason,
    })),
  });
}

async function seedFrame(
  db: Db,
  model: FrameModel,
  categoryId: string,
  random: Random,
  now: Date,
): Promise<SeededProduct> {
  const slug = slugify(model.name);
  const [lensWidthMm, bridgeMm, templeMm, lensHeightMm, totalWidthMm] = model.mm;
  const nosePads =
    model.material === 'metal' || model.material === 'titanium' || model.material === 'mixed';
  const isSun = model.category === 'sunglasses';

  const variants = model.colours.map((entry, position) => {
    const [code, tint] = (Array.isArray(entry) ? entry : [entry, null]) as [
      ColourwayCode,
      SunTintCode | null,
    ];
    const colourway = colourways[code];
    const tintInfo = tint ? sunTints[tint] : null;
    const colourName = tintInfo ? `${colourway.name}, ${tintInfo.name}` : colourway.name;
    const sku = [model.name.slice(0, 4), String(lensWidthMm), code, tint]
      .filter(Boolean)
      .join('-')
      .toUpperCase();
    return {
      sku,
      colourName,
      colourFamily: colourway.family,
      swatchHex: colourway.hex,
      secondaryHex: 'secondaryHex' in colourway ? colourway.secondaryHex : null,
      hardwareHex: 'hardwareHex' in colourway ? colourway.hardwareHex : null,
      finish: colourway.finish,
      lensTintHex: tintInfo?.hex ?? null,
      isDefault: position === 0,
      position,
    };
  });

  const categoryWords: Record<FrameModel['category'], string> = {
    eyeglasses: 'eyeglasses spectacles frames specs',
    sunglasses: 'sunglasses shades sun uv400',
    'computer-glasses': 'computer glasses screen blue light office',
    kids: 'kids children child school',
  };
  const searchText = [
    model.shape.replace('-', ' '),
    model.material,
    model.material === 'tr90' ? 'flexible' : '',
    model.rim.replace('-', ' '),
    model.fit,
    ...model.tags,
    ...variants.flatMap((variant) => [variant.colourName, variant.colourFamily.replace('-', ' ')]),
    categoryWords[model.category],
  ].join(' ');

  const affinity = faceShapeAffinity[model.shape];
  const product = await db.product.create({
    data: {
      slug,
      name: model.name,
      type: 'frame',
      categoryId,
      description: frameDescription(model),
      materialsAndCare: frameMaterialsAndCare(model),
      basePriceMinor: model.price * 100,
      fit: model.fit,
      styleTags: [...model.tags],
      lensesAvailable: true,
      isPublished: true,
      launchedAt: new Date(now.getTime() - model.launchedDaysAgo * 86_400_000),
      seoTitle: `${model.name} ${model.shape.replace('-', ' ')} ${isSun ? 'sunglasses' : 'glasses'}`,
      seoDescription: `${model.line} ${model.material === 'tr90' ? 'TR90' : model.material} frame, ${lensWidthMm}–${bridgeMm}–${templeMm} mm.`,
      popularity: model.popularity,
      searchText,
      frame: {
        create: {
          shape: model.shape,
          lensWidthMm,
          lensHeightMm,
          bridgeMm,
          templeMm,
          totalWidthMm,
          weightG: model.weightG,
          material: model.material,
          rimType: model.rim,
          hinge: model.springHinges ? 'spring' : 'standard',
          features: featuresFor(model, nosePads),
          nosePads,
        },
      },
      faceShapes: {
        create: Object.entries(affinity).map(([faceShape, score]) => ({ faceShape, score })),
      },
      variants: { create: variants },
    },
    include: { variants: { orderBy: { position: 'asc' } } },
  });

  const images = product.variants.flatMap((variant) =>
    renderKinds.map(([kind, label], position) => ({
      productId: product.id,
      variantId: variant.id,
      url: `/renders/${slug}/${variant.sku.toLowerCase()}-${kind}.webp`,
      alt: `${model.name} in ${variant.colourName}, ${label}`,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      kind,
      position,
    })),
  );
  await db.productImage.createMany({ data: images });
  await db.stockItem.createMany({
    data: product.variants.map((variant) => ({ variantId: variant.id, onHand: stockFor(random) })),
  });

  return {
    id: product.id,
    slug,
    name: model.name,
    priceMinor: product.basePriceMinor,
    model,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      colourName: variant.colourName,
      imageUrl: `/renders/${slug}/${variant.sku.toLowerCase()}-front.webp`,
    })),
  };
}

async function seedAccessory(
  db: Db,
  item: (typeof accessories)[number],
  categoryId: string,
  random: Random,
  now: Date,
): Promise<SeededProduct> {
  const product = await db.product.create({
    data: {
      slug: item.slug,
      name: item.name,
      type: 'accessory',
      categoryId,
      description: item.description,
      materialsAndCare: item.care,
      basePriceMinor: item.price * 100,
      fit: null,
      styleTags: item.tags,
      lensesAvailable: false,
      isPublished: true,
      launchedAt: new Date(now.getTime() - 300 * 86_400_000),
      seoTitle: item.name,
      seoDescription: item.description,
      popularity: item.popularity,
      searchText: `accessory ${item.tags.join(' ')} ${item.colours.map((code) => colourways[code].name).join(' ')}`,
      variants: {
        create: item.colours.map((code, position) => ({
          sku: `ACC-${item.slug}-${code}`.toUpperCase(),
          colourName: colourways[code].name,
          colourFamily: colourways[code].family,
          swatchHex: colourways[code].hex,
          finish: colourways[code].finish,
          isDefault: position === 0,
          position,
        })),
      },
    },
    include: { variants: { orderBy: { position: 'asc' } } },
  });
  await db.productImage.createMany({
    data: product.variants.map((variant, position) => ({
      productId: product.id,
      variantId: variant.id,
      url: `/images/accessories/${item.slug}.svg`,
      alt: `${item.name} in ${variant.colourName}`,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      kind: 'front',
      position,
    })),
  });
  await db.stockItem.createMany({
    data: product.variants.map((variant) => ({
      variantId: variant.id,
      onHand: stockFor(random) + 20,
    })),
  });
  return {
    id: product.id,
    slug: item.slug,
    name: item.name,
    priceMinor: product.basePriceMinor,
    model: null,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      colourName: variant.colourName,
      imageUrl: `/images/accessories/${item.slug}.svg`,
    })),
  };
}

/** Seeds categories, the lens catalogue, frames, accessories, collections and help articles. */
export async function seedCatalog(db: Db, random: Random, now: Date): Promise<SeededProduct[]> {
  const categoryIds = new Map<string, string>();
  for (const [sortOrder, category] of categories.entries()) {
    const created = await db.category.create({ data: { ...category, sortOrder } });
    categoryIds.set(category.slug, created.id);
  }
  const categoryId = (slug: string) => {
    const id = categoryIds.get(slug);
    if (!id) throw new Error(`Unknown category ${slug}`);
    return id;
  };

  await seedLensCatalogue(db);

  const products: SeededProduct[] = [];
  for (const model of frameModels)
    products.push(await seedFrame(db, model, categoryId(model.category), random, now));
  for (const item of accessories)
    products.push(await seedAccessory(db, item, categoryId('accessories'), random, now));

  const bySlug = new Map(products.map((product) => [product.slug, product]));
  for (const [sortOrder, seed] of collectionSeeds.entries()) {
    const members = seed
      .select(frameModels)
      .map((model) => bySlug.get(slugify(model.name)))
      .filter((product) => product !== undefined);
    await db.collection.create({
      data: {
        slug: seed.slug,
        name: seed.name,
        tagline: seed.tagline,
        description: seed.description,
        isFeatured: seed.isFeatured,
        sortOrder,
        products: {
          create: members.map((product, position) => ({ productId: product.id, position })),
        },
      },
    });
  }

  await db.helpArticle.createMany({
    data: helpArticles.map((article, sortOrder) => ({ ...article, sortOrder })),
  });
  return products;
}
