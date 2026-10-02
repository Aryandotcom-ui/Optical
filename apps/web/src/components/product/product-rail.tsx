import type { ProductSummary } from '@optical/shared/catalog';
import type { ReactNode } from 'react';
import { ProductCard } from './product-card';

/**
 * A row of product cards: a swipeable, snapping strip on phones and a plain
 * grid from tablet up, so nothing is hidden behind arrows on desktop.
 */
export function ProductRail({
  title,
  action,
  products,
  id,
}: {
  title: string;
  action?: ReactNode;
  products: ProductSummary[];
  id: string;
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <h2 id={id} className="text-headline font-semibold">
          {title}
        </h2>
        {action}
      </div>
      <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {products.slice(0, 8).map((product) => (
          <li key={product.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
            <ProductCard
              product={product}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 72vw"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
