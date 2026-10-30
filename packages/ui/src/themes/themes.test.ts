import { describe, expect, it } from 'vitest';
import { themes } from './index';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('brand themes', () => {
  for (const t of Object.values(themes)) {
    it(`${t.id}: body text meets WCAG AA on bg and surface`, () => {
      expect(contrast(t.colors.text, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.colors.text, t.colors.surface)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t.id}: muted text is readable on bg`, () => {
      expect(contrast(t.colors.muted, t.colors.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t.id}: accent buttons are legible`, () => {
      expect(contrast(t.colors.accentText, t.colors.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
