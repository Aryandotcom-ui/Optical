import { cva, type VariantProps } from 'class-variance-authority';
import { cloneElement, isValidElement, type ComponentProps, type ReactElement } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex min-h-11 items-center justify-center gap-2 font-medium select-none',
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
      /** Long labels (e.g. a filter name) may wrap instead of overflowing. */
      wrap: {
        false: 'whitespace-nowrap',
        true: 'py-2 text-center whitespace-normal',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', wrap: false },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Link) with button styling instead of a <button>. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  wrap,
  asChild = false,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, wrap }), className);
  if (asChild && isValidElement(children)) {
    // Style the single child (usually a Link) as the button.
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      ...props,
      className: cn(classes, child.props.className),
    } as never);
  }
  return (
    <button className={classes} type={type ?? 'button'} {...props}>
      {children}
    </button>
  );
}
