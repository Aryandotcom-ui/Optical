import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders a non-submitting button by default', () => {
    render(<Button>Choose lenses</Button>);
    const button = screen.getByRole('button', { name: 'Choose lenses' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('bg-accent-strong');
  });

  it('respects an explicit submit type', () => {
    render(<Button type="submit">Place order</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('renders its child element when asChild is set', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/status">Status</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Status' });
    expect(link).toHaveAttribute('href', '/status');
    expect(link).not.toHaveAttribute('type');
    expect(link.className).toContain('ring-hairline');
  });

  it('does not fire clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Unavailable
      </Button>,
    );
    screen.getByRole('button').click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('adds caller classes for layout', () => {
    render(<Button className="mt-6">Spaced</Button>);
    expect(screen.getByRole('button').className.split(' ')).toContain('mt-6');
  });

  it('wraps long labels only when asked', () => {
    render(
      <>
        <Button>Short</Button>
        <Button wrap>A much longer label</Button>
      </>,
    );
    const [short, long] = screen.getAllByRole('button');
    expect(short?.className).toContain('whitespace-nowrap');
    expect(long?.className).toContain('whitespace-normal');
    expect(long?.className).not.toContain('whitespace-nowrap');
  });

  it('styles a child link when asChild is set', () => {
    render(
      <Button asChild size="lg">
        <a href="#shop">Shop</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Shop' });
    expect(link.className).toContain('min-h-12');
    expect(link.getAttribute('type')).toBeNull();
  });
});

describe('Button styling', () => {
  it.each(['md', 'lg'] as const)('keeps readable on-accent text at size %s', (size) => {
    render(<Button size={size}>Pay</Button>);
    expect(screen.getByRole('button').className.split(' ')).toContain('text-on-accent');
  });
});
