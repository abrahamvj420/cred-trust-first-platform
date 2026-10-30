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
  radius: { sm: string; md: string; lg: string };
}
