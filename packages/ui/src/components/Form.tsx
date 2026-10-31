'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Labelled input. Every input in the apps goes through this, so none lacks a label. */
export function Field({
  label,
  hint,
  error,
  prefix,
  className = '',
  inputClassName = '',
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null; prefix?: string; inputClassName?: string }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-callout font-semibold">
        {label}
      </label>
      <div className={`flex min-h-12 items-center gap-2 rounded-md border bg-raised px-4 transition-calm focus-within:border-accent ${error ? 'border-negative' : 'border-border'}`}>
        {prefix ? <span className="text-muted">{prefix}</span> : null}
        <input id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} {...input} className={`min-w-0 flex-1 bg-transparent py-3 text-body outline-none placeholder:text-muted ${inputClassName}`} />
      </div>
      {hint ? <p id={`${id}-hint`} className="text-caption text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-err`} className="text-caption text-negative">{error}</p> : null}
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
}

/** Radio cards: a labelled group, each option at least 56px tall. */
export function Choice<T extends string>({ legend, name, options, value, onChange }: { legend: string; name: string; options: ChoiceOption<T>[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-callout font-semibold">{legend}</legend>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <label
            key={o.value}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-calm ${selected ? 'border-accent bg-raised' : 'border-border bg-surface hover:border-muted'} ${o.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            <input type="radio" name={name} value={o.value} checked={selected} disabled={o.disabled} onChange={() => onChange(o.value)} className="sr-only" />
            <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-accent' : 'border-muted'}`}>
              {selected ? <span className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body">{o.title}</span>
              {o.detail ? <span className="block text-caption text-muted">{o.detail}</span> : null}
            </span>
            {o.trailing ? <span className="shrink-0 text-right">{o.trailing}</span> : null}
          </label>
        );
      })}
    </fieldset>
  );
}

/** Bottom sheet with backdrop; Esc and backdrop close it. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <button aria-label="Close" className="absolute inset-0 animate-fade bg-bg/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="relative w-full max-w-[390px] animate-sheet rounded-t-xl border border-border bg-surface p-gutter pb-8 shadow-e3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <h2 id={id} className="text-headline">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-text">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
