'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * A product image that degrades gracefully: if the file is missing (for
 * example renders not generated yet), it shows a neutral silhouette with
 * the same dimensions, so the layout never shifts or breaks.
 */
export function ProductImage({ className, alt, ...props }: ImageProps) {
  const [failedSrc, setFailedSrc] = useState<ImageProps['src'] | null>(null);
  if (failedSrc === props.src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('flex items-center justify-center text-hairline', className)}
      >
        <svg
          viewBox="0 0 64 24"
          className="w-1/2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <circle cx="16" cy="12" r="9" />
          <circle cx="48" cy="12" r="9" />
          <path d="M25 12c3-3 11-3 14 0" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <Image
      alt={alt}
      className={className}
      onError={() => {
        setFailedSrc(props.src);
      }}
      {...props}
    />
  );
}
