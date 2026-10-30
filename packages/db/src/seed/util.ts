/** Deterministic helpers so every reset produces the same world. */

export const rupees = (r: number): number => Math.round(r * 100);

export function prng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(y: number, m: number, d: number): string {
  // m is 1-based and may overflow/underflow
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

export function addDays(s: string, days: number): string {
  const { y, m, d } = parseYmd(s);
  return ymd(y, m, d + days);
}

export function addMonths(s: string, months: number): string {
  const { y, m, d } = parseYmd(s);
  return ymd(y, m + months, d);
}

/** Midday IST on a calendar date, as a Date. */
export function at(dateYmd: string, hour = 12, minute = 0): Date {
  return new Date(`${dateYmd}T${pad(hour)}:${pad(minute)}:00+05:30`);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
