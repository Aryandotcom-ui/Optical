'use client';

import {
  colourFamilies,
  faceShapes,
  frameFinishes,
  frameFits,
  frameMaterials,
  frameShapes,
  rimTypes,
} from '@optical/shared/catalog';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminGet, adminSend, adminUpload } from './admin-api';
import { useCanWrite } from './admin-context';
import {
  Check,
  Field,
  PageHeader,
  Panel,
  Select,
  StatusBadge,
  TextArea,
  toMinor,
  toRupees,
  useAction,
} from './ui';

interface Variant {
  id: string;
  sku: string;
  colourName: string;
  colourFamily: string;
  swatchHex: string;
  finish: string;
  priceOverrideMinor: number | null;
  isActive: boolean;
  stock: { onHand: number; reserved: number } | null;
}
interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  materialsAndCare: string;
  basePriceMinor: number;
  fit: string | null;
  styleTags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  isPublished: boolean;
  lensesAvailable: boolean;
  category: { slug: string; name: string };
  frame: {
    shape: string;
    lensWidthMm: number;
    lensHeightMm: number;
    bridgeMm: number;
    templeMm: number;
    totalWidthMm: number;
    weightG: number;
    material: string;
    rimType: string;
  } | null;
  faceShapes: { faceShape: string; score: number }[];
  variants: Variant[];
  images: { id: string; url: string; alt: string; kind: string }[];
}

const CATEGORIES = ['eyeglasses', 'sunglasses', 'computer-glasses', 'kids', 'accessories'];

export function NewProduct() {
  const router = useRouter();
  const action = useAction();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    categorySlug: 'eyeglasses',
    type: 'frame',
    price: '',
    description: '',
  });
  return (
    <>
      <PageHeader
        title="New product"
        description="It starts as a draft; add colours and images, then publish."
      />
      <Panel className="max-w-2xl">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action
              .run(() =>
                adminSend<Product>('POST', '/products', {
                  name: form.name,
                  slug: form.slug,
                  categorySlug: form.categorySlug,
                  type: form.type,
                  basePriceMinor: toMinor(form.price),
                  description: form.description,
                }),
              )
              .then((product) => {
                if (product) router.push(`/admin/products/${product.id}` as Route);
              });
          }}
        >
          <Field
            label="Name"
            required
            maxLength={80}
            value={form.name}
            onChange={(event) => {
              setForm({
                ...form,
                name: event.target.value,
                slug:
                  form.slug ||
                  event.target.value
                    .toLowerCase()
                    .replaceAll(/[^a-z0-9]+/g, '-')
                    .replaceAll(/^-|-$/g, ''),
              });
            }}
          />
          <Field
            label="Address (slug)"
            required
            pattern="[a-z0-9-]{1,80}"
            value={form.slug}
            onChange={(event) => {
              setForm({ ...form, slug: event.target.value });
            }}
            hint="Lowercase letters, numbers and hyphens: /p/your-slug"
          />
          <Select
            label="Category"
            value={form.categorySlug}
            onChange={(event) => {
              setForm({ ...form, categorySlug: event.target.value });
            }}
            options={CATEGORIES}
          />
          <Select
            label="Type"
            value={form.type}
            onChange={(event) => {
              setForm({ ...form, type: event.target.value });
            }}
            options={['frame', 'accessory']}
          />
          <Field
            label="Price (₹, tax included)"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.price}
            onChange={(event) => {
              setForm({ ...form, price: event.target.value });
            }}
          />
          <TextArea
            label="Description"
            required
            className="sm:col-span-2"
            maxLength={4000}
            value={form.description}
            onChange={(event) => {
              setForm({ ...form, description: event.target.value });
            }}
          />
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={action.busy}>
              Create draft
            </Button>
            {action.status}
          </div>
        </form>
      </Panel>
    </>
  );
}

export function ProductEditor({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const canWrite = useCanWrite('products');
  useEffect(() => {
    adminGet<Product>(`/products/${id}`).then(setProduct, () => undefined);
  }, [id]);
  if (!product) return <p aria-live="polite">Loading…</p>;
  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.category.name} · /p/${product.slug}`}
        actions={
          <>
            <StatusBadge value={product.isPublished ? 'PUBLISHED' : 'DRAFT'} />
            {product.isPublished ? (
              <Button asChild variant="secondary">
                <Link href={`/p/${product.slug}` as Route}>View in shop</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <fieldset disabled={!canWrite} className="grid gap-6 xl:grid-cols-2">
        <Details product={product} onSaved={setProduct} />
        <div className="space-y-6">
          {product.frame || product.category.slug !== 'accessories' ? (
            <FrameSpecForm product={product} onSaved={setProduct} />
          ) : null}
          <Images product={product} onSaved={setProduct} />
        </div>
        <Colours product={product} onSaved={setProduct} />
      </fieldset>
    </>
  );
}

function Details({ product, onSaved }: { product: Product; onSaved: (product: Product) => void }) {
  const action = useAction();
  const [form, setForm] = useState({
    name: product.name,
    price: toRupees(product.basePriceMinor),
    description: product.description,
    materialsAndCare: product.materialsAndCare,
    fit: product.fit ?? '',
    styleTags: product.styleTags.join(', '),
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
    isPublished: product.isPublished,
    lensesAvailable: product.lensesAvailable,
    faceShapes: Object.fromEntries(
      faceShapes.map((shape) => [
        shape,
        String(product.faceShapes.find((entry) => entry.faceShape === shape)?.score ?? 0),
      ]),
    ),
  });
  return (
    <Panel title="Details">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void action
            .run(() =>
              adminSend<Product>('PATCH', `/products/${product.id}`, {
                name: form.name,
                basePriceMinor: toMinor(form.price),
                description: form.description,
                materialsAndCare: form.materialsAndCare,
                fit: form.fit || null,
                styleTags: form.styleTags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
                seoTitle: form.seoTitle || null,
                seoDescription: form.seoDescription || null,
                isPublished: form.isPublished,
                lensesAvailable: form.lensesAvailable,
                faceShapes: Object.entries(form.faceShapes).map(([faceShape, score]) => ({
                  faceShape,
                  score: Number(score),
                })),
              }),
            )
            .then((next) => {
              if (next) onSaved(next);
            });
        }}
      >
        <Field
          label="Name"
          required
          maxLength={80}
          value={form.name}
          onChange={(event) => {
            setForm({ ...form, name: event.target.value });
          }}
        />
        <Field
          label="Price (₹)"
          type="number"
          min="0"
          step="0.01"
          required
          value={form.price}
          onChange={(event) => {
            setForm({ ...form, price: event.target.value });
          }}
        />
        <TextArea
          label="Description"
          className="sm:col-span-2"
          required
          value={form.description}
          onChange={(event) => {
            setForm({ ...form, description: event.target.value });
          }}
        />
        <TextArea
          label="Materials and care"
          className="sm:col-span-2"
          value={form.materialsAndCare}
          onChange={(event) => {
            setForm({ ...form, materialsAndCare: event.target.value });
          }}
        />
        <Select
          label="Fit"
          value={form.fit}
          onChange={(event) => {
            setForm({ ...form, fit: event.target.value });
          }}
          options={[
            { value: '', label: 'Not set' },
            ...frameFits.map((fit) => ({ value: fit, label: fit })),
          ]}
        />
        <Field
          label="Style tags (comma-separated)"
          value={form.styleTags}
          onChange={(event) => {
            setForm({ ...form, styleTags: event.target.value });
          }}
        />
        <fieldset className="sm:col-span-2">
          <legend className="text-caption font-medium">
            Face-shape scores (0 to 1; Frame Finder and filters use these)
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {faceShapes.map((shape) => (
              <Field
                key={shape}
                label={shape}
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={form.faceShapes[shape] ?? '0'}
                onChange={(event) => {
                  setForm({
                    ...form,
                    faceShapes: { ...form.faceShapes, [shape]: event.target.value },
                  });
                }}
              />
            ))}
          </div>
        </fieldset>
        <Field
          label="SEO title"
          maxLength={70}
          value={form.seoTitle}
          onChange={(event) => {
            setForm({ ...form, seoTitle: event.target.value });
          }}
          hint={`${form.seoTitle.length}/70`}
        />
        <Field
          label="SEO description"
          maxLength={160}
          value={form.seoDescription}
          onChange={(event) => {
            setForm({ ...form, seoDescription: event.target.value });
          }}
          hint={`${form.seoDescription.length}/160`}
        />
        <Check
          label="Published (visible in the shop)"
          checked={form.isPublished}
          onChange={(event) => {
            setForm({ ...form, isPublished: event.target.checked });
          }}
        />
        <Check
          label="Prescription lenses available"
          checked={form.lensesAvailable}
          onChange={(event) => {
            setForm({ ...form, lensesAvailable: event.target.checked });
          }}
        />
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={action.busy}>
            Save details
          </Button>
          {action.status}
        </div>
      </form>
    </Panel>
  );
}

const MEASUREMENTS = [
  ['lensWidthMm', 'Lens width (mm)'],
  ['lensHeightMm', 'Lens height (mm)'],
  ['bridgeMm', 'Bridge (mm)'],
  ['templeMm', 'Temple (mm)'],
  ['totalWidthMm', 'Total width (mm)'],
  ['weightG', 'Weight (g)'],
] as const;

function FrameSpecForm({
  product,
  onSaved,
}: {
  product: Product;
  onSaved: (product: Product) => void;
}) {
  const action = useAction();
  const frame = product.frame;
  const [form, setForm] = useState<Record<string, string>>({
    shape: frame?.shape ?? 'round',
    material: frame?.material ?? 'acetate',
    rimType: frame?.rimType ?? 'full-rim',
    ...Object.fromEntries(MEASUREMENTS.map(([key]) => [key, frame ? String(frame[key]) : ''])),
  });
  return (
    <Panel title="Frame and 3D model">
      <p className="mb-3 text-caption text-ink-secondary">
        The 3D viewer and try-on draw the frame from these numbers and the shape preset.
      </p>
      <form
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void action
            .run(() =>
              adminSend<Product>('PATCH', `/products/${product.id}`, {
                frame: {
                  shape: form.shape,
                  material: form.material,
                  rimType: form.rimType,
                  ...Object.fromEntries(MEASUREMENTS.map(([key]) => [key, Number(form[key])])),
                },
              }),
            )
            .then((next) => {
              if (next) onSaved(next);
            });
        }}
      >
        <Select
          label="Shape preset"
          value={form.shape}
          onChange={(event) => {
            setForm({ ...form, shape: event.target.value });
          }}
          options={frameShapes}
        />
        <Select
          label="Material"
          value={form.material}
          onChange={(event) => {
            setForm({ ...form, material: event.target.value });
          }}
          options={frameMaterials}
        />
        <Select
          label="Rim"
          value={form.rimType}
          onChange={(event) => {
            setForm({ ...form, rimType: event.target.value });
          }}
          options={rimTypes}
        />
        {MEASUREMENTS.map(([key, label]) => (
          <Field
            key={key}
            label={label}
            type="number"
            step="0.1"
            required
            value={form[key] ?? ''}
            onChange={(event) => {
              setForm({ ...form, [key]: event.target.value });
            }}
          />
        ))}
        <div className="col-span-full flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={action.busy}>
            Save frame
          </Button>
          {action.status}
        </div>
      </form>
    </Panel>
  );
}

function Images({ product, onSaved }: { product: Product; onSaved: (product: Product) => void }) {
  const action = useAction();
  const [kind, setKind] = useState('front');
  const move = (index: number, by: number) => {
    const ids = product.images.map((image) => image.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    void action
      .run(() => adminSend<Product>('PUT', `/products/${product.id}/images/order`, { ids }))
      .then((next) => {
        if (next) onSaved(next);
      });
  };
  return (
    <Panel title="Images">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {product.images.map((image, index) => (
          <li key={image.id} className="rounded-control bg-surface-muted p-2 text-caption">
            {/* Admin preview of any stored image, including uploads served by the API. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt} className="aspect-[4/3] w-full object-contain" />
            <p className="mt-1 truncate">
              {image.kind} · {image.alt}
            </p>
            <div className="mt-1 flex gap-1">
              <Button
                variant="ghost"
                className="min-h-8 px-2"
                disabled={index === 0}
                aria-label={`Move ${image.alt} earlier`}
                onClick={() => {
                  move(index, -1);
                }}
              >
                ←
              </Button>
              <Button
                variant="ghost"
                className="min-h-8 px-2"
                disabled={index === product.images.length - 1}
                aria-label={`Move ${image.alt} later`}
                onClick={() => {
                  move(index, 1);
                }}
              >
                →
              </Button>
              <Button
                variant="ghost"
                className="min-h-8 px-2"
                onClick={() => {
                  void action
                    .run(
                      () => adminSend<Product>('DELETE', `/images/${image.id}`),
                      'Image removed.',
                    )
                    .then((next) => {
                      if (next) onSaved(next);
                    });
                }}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Select
          label="View"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
          }}
          options={['front', 'angle', 'side', 'on-face', 'detail']}
        />
        <label className="text-caption font-medium">
          Upload an image (JPEG, PNG or WebP)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block text-caption"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void action
                .run(
                  () => adminUpload<Product>(`/products/${product.id}/images?kind=${kind}`, file),
                  'Image added.',
                )
                .then((next) => {
                  if (next) onSaved(next);
                  event.target.value = '';
                });
            }}
          />
        </label>
      </div>
      {action.status}
    </Panel>
  );
}

function Colours({ product, onSaved }: { product: Product; onSaved: (product: Product) => void }) {
  const action = useAction();
  const blank = {
    sku: '',
    colourName: '',
    colourFamily: 'black',
    swatchHex: '#111111',
    finish: 'glossy',
    price: '',
  };
  const [form, setForm] = useState(blank);
  return (
    <Panel title="Colours" className="xl:col-span-2">
      <table className="w-full text-left text-caption">
        <thead className="text-ink-secondary">
          <tr>
            <th scope="col" className="py-1">
              Colour
            </th>
            <th scope="col">SKU</th>
            <th scope="col">Finish</th>
            <th scope="col">Price override</th>
            <th scope="col">Stock</th>
            <th scope="col">Active</th>
          </tr>
        </thead>
        <tbody>
          {product.variants.map((variant) => (
            <tr key={variant.id} className="border-t border-hairline">
              <td className="py-2">
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block size-4 rounded-pill align-middle ring-1 ring-hairline"
                  style={{ backgroundColor: variant.swatchHex }}
                />
                {variant.colourName}
              </td>
              <td>{variant.sku}</td>
              <td>{variant.finish}</td>
              <td>
                {variant.priceOverrideMinor === null
                  ? '—'
                  : `₹${toRupees(variant.priceOverrideMinor)}`}
              </td>
              <td className="tabular">
                {variant.stock ? variant.stock.onHand - variant.stock.reserved : 0}
              </td>
              <td>
                <input
                  type="checkbox"
                  className="size-5"
                  aria-label={`${variant.colourName} is on sale`}
                  checked={variant.isActive}
                  onChange={(event) => {
                    void action
                      .run(() =>
                        adminSend<Product>('PATCH', `/variants/${variant.id}`, {
                          isActive: event.target.checked,
                        }),
                      )
                      .then((next) => {
                        if (next) onSaved(next);
                      });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void action
            .run(
              () =>
                adminSend<Product>('POST', `/products/${product.id}/variants`, {
                  sku: form.sku.toUpperCase(),
                  colourName: form.colourName,
                  colourFamily: form.colourFamily,
                  swatchHex: form.swatchHex,
                  finish: form.finish,
                  priceOverrideMinor: form.price ? toMinor(form.price) : null,
                }),
              'Colour added. Add stock in Inventory.',
            )
            .then((next) => {
              if (next) {
                onSaved(next);
                setForm(blank);
              }
            });
        }}
      >
        <Field
          label="Colour name"
          required
          value={form.colourName}
          onChange={(event) => {
            setForm({ ...form, colourName: event.target.value });
          }}
        />
        <Field
          label="SKU"
          required
          pattern="[A-Za-z0-9-]{3,40}"
          value={form.sku}
          onChange={(event) => {
            setForm({ ...form, sku: event.target.value });
          }}
        />
        <Select
          label="Family"
          value={form.colourFamily}
          onChange={(event) => {
            setForm({ ...form, colourFamily: event.target.value });
          }}
          options={colourFamilies}
        />
        <Field
          label="Swatch"
          type="color"
          value={form.swatchHex}
          onChange={(event) => {
            setForm({ ...form, swatchHex: event.target.value });
          }}
        />
        <Select
          label="Finish"
          value={form.finish}
          onChange={(event) => {
            setForm({ ...form, finish: event.target.value });
          }}
          options={frameFinishes}
        />
        <Field
          label="Price override (₹)"
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={(event) => {
            setForm({ ...form, price: event.target.value });
          }}
        />
        <div className="col-span-full flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={action.busy}>
            Add colour
          </Button>
          {action.status}
        </div>
      </form>
    </Panel>
  );
}
