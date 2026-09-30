import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex min-h-11 items-center justify-center gap-2 font-medium whitespace-nowrap select-none',
    'transition-[background-color,color,box-shadow,transform] duration-micro ease-standard',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
    'motion-reduce:transition-colors motion-reduce:active:scale-100',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent-strong text-on-accent hover:brightness-110',
        secondary: 'bg-surface text-ink ring-1 ring-hairline ring-inset hover:bg-surface-muted',
        ghost: 'text-accent hover:bg-surface-muted',
      },
      size: {
        md: 'rounded-pill px-5 text-body',
        lg: 'min-h-12 rounded-pill px-7 text-body-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Link) with button styling instead of a <button>. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
