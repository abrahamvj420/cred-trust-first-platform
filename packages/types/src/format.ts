const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,00,000 — whole rupees, Indian grouping. */
export function formatInr(paise: number): string {
  return inr.format(Math.round(paise / 100));
}

/** ₹1,00,000.50 — with paise, for statements and key facts. */
export function formatInrExact(paise: number): string {
  return inrPaise.format(paise / 100);
}

/** 1600 bps → "16%" / 1650 → "16.5%". */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

export const rupees = (r: number): number => Math.round(r * 100);
