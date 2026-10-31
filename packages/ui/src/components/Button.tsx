import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet';
type Size = 'md' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-text shadow-e1 hover:brightness-105 active:scale-[0.98]',
  secondary: 'bg-raised text-text border border-border hover:border-muted active:scale-[0.98]',
  ghost: 'text-text hover:bg-raised active:scale-[0.98]',
  quiet: 'text-muted hover:text-text',
};
const sizes: Record<Size, string> = {
  md: 'min-h-12 px-5 text-headline',
  sm: 'min-h-11 px-4 text-callout font-semibold',
};

const classes = (variant: Variant, size: Size, block: boolean, extra: string) =>
  `inline-flex items-center justify-center gap-2 rounded-md transition-calm select-none disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${extra}`;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

/**
 * Minimum 44px tall. Offer screens pair a primary action with a secondary
 * "No thanks" of the same size (no dark patterns).
 */
export function Button({ variant = 'primary', size = 'md', block = false, loading = false, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={classes(variant, size, block, className)}>
      {loading ? <Spinner size={18} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', block = false, className = '', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size; block?: boolean; children: ReactNode }) {
  return (
    <a {...props} className={classes(variant, size, block, className)}>
      {children}
    </a>
  );
}
