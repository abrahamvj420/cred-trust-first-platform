/**
 * A brand theme. Every colour, font and radius an app uses comes from its
 * theme file; apps never hard-code colours or fonts.
 */
export interface BrandTheme {
  id: 'cred' | 'admin' | 'shopkart' | 'mockbank' | 'upi' | 'aa' | 'insurer' | 'fundhouse';
  displayName: string;
  mode: 'dark' | 'light';
  /** Google font family loaded by the app with next/font, exposed as --font-brand. */
  font: { sans: string; mono?: string };
  colors: {
    bg: string;
    surface: string;
    raised: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    positive: string;
    negative: string;
    warning: string;
  };
  radius: { sm: string; md: string; lg: string; xl: string };
  /** Type scale: [size, line-height, letter-spacing, weight]. */
  type: Record<'display' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'overline', [string, string, string, number]>;
  /** Layout spacing beyond Tailwind's 4px scale. */
  space: { gutter: string; section: string; card: string };
  /** Shadows/highlights for resting cards, raised cards and sheets. */
  elevation: { e1: string; e2: string; e3: string };
  /** Durations and easing for the few transitions we use. */
  motion: { fast: string; base: string; slow: string; standard: string; emphasized: string };
}
