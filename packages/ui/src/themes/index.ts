import type { CSSProperties } from 'react';
import type { BrandTheme } from './types';

export type { BrandTheme } from './types';

const radius = (sm: number, md: number, lg: number) => ({ sm: `${sm}px`, md: `${md}px`, lg: `${lg}px` });

/** CRED member app: premium, dark, minimal. No CRED logos or trademarks. */
export const credTheme: BrandTheme = {
  id: 'cred',
  displayName: 'CRED',
  mode: 'dark',
  font: { sans: 'Manrope' },
  colors: {
    bg: '#0A0A0B',
    surface: '#131315',
    raised: '#1B1B1E',
    border: '#2A2A2E',
    text: '#F4F2EE',
    muted: '#8D8B87',
    accent: '#E6D8BC',
    accentText: '#0A0A0B',
    positive: '#6FD8A6',
    negative: '#FF7A70',
    warning: '#F2C46D',
  },
  radius: radius(10, 16, 24),
};

/** CRED internal console: calm, dense, readable. */
export const adminTheme: BrandTheme = {
  id: 'admin',
  displayName: 'CRED Console',
  mode: 'dark',
  font: { sans: 'Inter', mono: 'JetBrains Mono' },
  colors: {
    bg: '#0E1015',
    surface: '#151821',
    raised: '#1C2029',
    border: '#2A2F3B',
    text: '#E5E8EE',
    muted: '#8A92A3',
    accent: '#7AA2F7',
    accentText: '#0E1015',
    positive: '#4ADE80',
    negative: '#F87171',
    warning: '#FBBF24',
  },
  radius: radius(6, 8, 12),
};

/** ShopKart: a bright, real-looking online store. */
export const shopkartTheme: BrandTheme = {
  id: 'shopkart',
  displayName: 'ShopKart',
  mode: 'light',
  font: { sans: 'Poppins' },
  colors: {
    bg: '#FFFFFF',
    surface: '#F5F6F8',
    raised: '#FFFFFF',
    border: '#E3E6EB',
    text: '#141A26',
    muted: '#5F6B7D',
    accent: '#C2410C',
    accentText: '#FFFFFF',
    positive: '#16A34A',
    negative: '#DC2626',
    warning: '#D97706',
  },
  radius: radius(6, 10, 16),
};

/** Mock Bank: conservative navy retail bank. */
export const mockbankTheme: BrandTheme = {
  id: 'mockbank',
  displayName: 'Mock Bank',
  mode: 'light',
  font: { sans: 'Source Sans 3' },
  colors: {
    bg: '#F3F5F9',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    border: '#D7DEEA',
    text: '#0E1E3D',
    muted: '#5A6A85',
    accent: '#0B3D91',
    accentText: '#FFFFFF',
    positive: '#15803D',
    negative: '#B91C1C',
    warning: '#B45309',
  },
  radius: radius(4, 6, 10),
};

/** UPI switch PIN page: plain, trustworthy, green. */
export const upiTheme: BrandTheme = {
  id: 'upi',
  displayName: 'UPI',
  mode: 'light',
  font: { sans: 'Roboto' },
  colors: {
    bg: '#FFFFFF',
    surface: '#F4F7F4',
    raised: '#FFFFFF',
    border: '#DCE5DC',
    text: '#1A1F1A',
    muted: '#5C6B5C',
    accent: '#1F7A3A',
    accentText: '#FFFFFF',
    positive: '#1F7A3A',
    negative: '#C62828',
    warning: '#B26A00',
  },
  radius: radius(6, 10, 14),
};

/** Account Aggregator consent manager: regulated, teal, explicit. */
export const aaTheme: BrandTheme = {
  id: 'aa',
  displayName: 'SimAA Account Aggregator',
  mode: 'light',
  font: { sans: 'IBM Plex Sans' },
  colors: {
    bg: '#F2F7F7',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    border: '#D2E2E1',
    text: '#0F2A2A',
    muted: '#557070',
    accent: '#0F766E',
    accentText: '#FFFFFF',
    positive: '#0F766E',
    negative: '#B42318',
    warning: '#B54708',
  },
  radius: radius(4, 8, 12),
};

/** Sahaj Health Insurance: warm, caring purple. */
export const insurerTheme: BrandTheme = {
  id: 'insurer',
  displayName: 'Sahaj Health Insurance',
  mode: 'light',
  font: { sans: 'Nunito Sans' },
  colors: {
    bg: '#FAF7FD',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    border: '#E7DDF2',
    text: '#22152F',
    muted: '#6B5A7D',
    accent: '#6D28D9',
    accentText: '#FFFFFF',
    positive: '#15803D',
    negative: '#BE123C',
    warning: '#B45309',
  },
  radius: radius(8, 12, 18),
};

/** Meridian Mutual Fund: considered, ochre. */
export const fundhouseTheme: BrandTheme = {
  id: 'fundhouse',
  displayName: 'Meridian Mutual Fund',
  mode: 'light',
  font: { sans: 'DM Sans' },
  colors: {
    bg: '#FBF8F3',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    border: '#EADFCC',
    text: '#2A2116',
    muted: '#7A6A55',
    accent: '#A15C07',
    accentText: '#FFFFFF',
    positive: '#3F7D20',
    negative: '#B42318',
    warning: '#A15C07',
  },
  radius: radius(4, 8, 14),
};

export const themes = {
  cred: credTheme,
  admin: adminTheme,
  shopkart: shopkartTheme,
  mockbank: mockbankTheme,
  upi: upiTheme,
  aa: aaTheme,
  insurer: insurerTheme,
  fundhouse: fundhouseTheme,
} as const satisfies Record<BrandTheme['id'], BrandTheme>;

/**
 * CSS variables for a theme. Apply on <body> (single-brand apps) or on a
 * route wrapper (the ecosystem app). tailwind.css maps them to utilities.
 */
export function themeVars(t: BrandTheme): CSSProperties {
  const c = t.colors;
  return {
    colorScheme: t.mode,
    '--brand-bg': c.bg,
    '--brand-surface': c.surface,
    '--brand-raised': c.raised,
    '--brand-border': c.border,
    '--brand-text': c.text,
    '--brand-muted': c.muted,
    '--brand-accent': c.accent,
    '--brand-accent-text': c.accentText,
    '--brand-positive': c.positive,
    '--brand-negative': c.negative,
    '--brand-warning': c.warning,
    '--brand-radius-sm': t.radius.sm,
    '--brand-radius-md': t.radius.md,
    '--brand-radius-lg': t.radius.lg,
  } as CSSProperties;
}
