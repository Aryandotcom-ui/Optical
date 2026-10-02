import { Skeleton } from '@/components/ui/skeleton';

/** Matches the listing layout exactly (header, sidebar, 4:3 cards), so nothing jumps when results arrive. */
export function ListingSkeleton() {
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-12 w-72 max-w-full" />
      <Skeleton className="mt-4 h-6 w-[32rem] max-w-full" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
        <div>
          <Skeleton className="h-11 w-40" />
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index}>
                <Skeleton className="aspect-[4/3] w-full rounded-media" />
                <Skeleton className="mt-3 h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
