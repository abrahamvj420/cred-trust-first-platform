import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-accent-text hover:opacity-90',
  secondary: 'bg-raised text-text border border-border hover:border-muted',
  ghost: 'text-muted hover:text-text',
};

/**
 * Offer screens pair a primary action with a secondary "No thanks" of equal
 * size: same height, width and type scale (no dark patterns).
 */
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-12 items-center justify-center rounded-md px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
