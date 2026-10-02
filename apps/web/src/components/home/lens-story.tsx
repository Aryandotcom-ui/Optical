'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { LensVisual, type LensStep, type LensVisualData } from './lens-visuals';

export interface LensStoryStep {
  id: LensStep;
  eyebrow: string;
  title: string;
  body: string;
  price: string;
}

/**
 * Four short chapters about lenses. On wide screens the illustration stays
 * pinned (CSS sticky, so scrolling is never hijacked) and changes as each
 * chapter reaches the middle of the screen; on phones each chapter carries
 * its own illustration.
 */
export function LensStory({ steps, visuals }: { steps: LensStoryStep[]; visuals: LensVisualData }) {
  const [active, setActive] = useState<LensStep>(steps[0]?.id ?? 'thin');
  const refs = useRef(new Map<LensStep, HTMLElement>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.step as LensStep | undefined;
          if (entry.isIntersecting && id) setActive(id);
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const element of refs.current.values()) observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
      <div className="hidden lg:block">
        <div className="sticky top-[20vh] flex h-[60vh] items-center justify-center rounded-media bg-surface-muted p-10 text-ink">
          {/* All four stay mounted and cross-fade; reduced motion makes the swap instant. */}
          <div className="grid w-full">
            {steps.map((step) => (
              <div
                key={step.id}
                aria-hidden="true"
                className={cn(
                  'duration-ui col-start-1 row-start-1 transition-[opacity,translate] ease-standard motion-reduce:transition-none',
                  step.id === active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
                )}
              >
                <LensVisual step={step.id} data={visuals} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <ol className="space-y-16 lg:space-y-0">
        {steps.map((step) => (
          <li
            key={step.id}
            data-step={step.id}
            ref={(element) => {
              if (element) refs.current.set(step.id, element);
              else refs.current.delete(step.id);
            }}
            className="flex flex-col justify-center lg:min-h-[70vh]"
          >
            <div className="mb-6 rounded-media bg-surface-muted p-6 text-ink lg:hidden">
              <LensVisual step={step.id} data={visuals} />
            </div>
            <p className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
              {step.eyebrow}
            </p>
            <h3
              className={cn(
                'duration-ui mt-3 text-display-md font-semibold text-balance transition-colors',
                active !== step.id && 'lg:text-ink-secondary',
              )}
            >
              {step.title}
            </h3>
            <p className="mt-4 max-w-prose text-body-lg text-pretty text-ink-secondary">
              {step.body}
            </p>
            <p className="tabular mt-4 font-medium">{step.price}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
