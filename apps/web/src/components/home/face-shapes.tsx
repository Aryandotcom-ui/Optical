import type { FaceShape } from '@optical/shared/catalog';
import type { Route } from 'next';
import Link from 'next/link';

/** Simplified face outlines in a 60 × 80 box: just enough to recognise the shape. */
const outlines: Record<FaceShape, string> = {
  oval: 'M30 6 C48 6 54 24 54 40 C54 60 44 74 30 74 C16 74 6 60 6 40 C6 24 12 6 30 6 Z',
  round: 'M30 10 C48 10 56 24 56 42 C56 60 46 72 30 72 C14 72 4 60 4 42 C4 24 12 10 30 10 Z',
  square:
    'M10 10 L50 10 C53 10 54 12 54 15 L54 58 C54 66 46 72 30 72 C14 72 6 66 6 58 L6 15 C6 12 7 10 10 10 Z',
  heart:
    'M8 12 C14 6 46 6 52 12 C56 18 54 34 50 46 C46 58 38 72 30 74 C22 72 14 58 10 46 C6 34 4 18 8 12 Z',
  oblong:
    'M30 4 C44 4 50 14 50 26 L50 56 C50 68 42 76 30 76 C18 76 10 68 10 56 L10 26 C10 14 16 4 30 4 Z',
  diamond:
    'M30 4 C36 4 44 18 52 34 C56 42 50 56 42 66 C38 72 34 75 30 75 C26 75 22 72 18 66 C10 56 4 42 8 34 C16 18 24 4 30 4 Z',
};

/**
 * A light-touch guide: pick the face shape closest to yours and see the
 * eyeglasses that tend to balance it. The counts come from the live catalogue.
 */
export function FaceShapes({
  items,
}: {
  items: { shape: FaceShape; label: string; count: string }[];
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <li key={item.shape}>
          <Link
            href={`/shop/eyeglasses?faceShape=${item.shape}` as Route}
            className="group duration-micro flex flex-col items-center gap-3 rounded-card bg-surface-muted px-4 py-6 text-center transition-colors ease-standard hover:bg-hairline"
          >
            <svg
              viewBox="0 0 60 80"
              className="h-20 w-auto text-ink-secondary transition-colors group-hover:text-ink"
              aria-hidden="true"
            >
              <path d={outlines[item.shape]} fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="font-medium">{item.label}</span>
            <span className="text-caption text-ink-secondary">{item.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
