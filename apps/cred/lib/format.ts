/** Dates on the simulated calendar (YYYY-MM-DD), formatted for people. */
const day = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

export function daysUntil(today: string, date: string): number {
  return Math.round((day(date) - day(today)) / 86_400_000);
}

/** `badge` is the countdown, `date` the calendar date, `text` both together. */
export function dueLabel(today: string, dueDate: string): { text: string; badge: string; date: string; tone: 'neutral' | 'warning' | 'negative' } {
  const d = daysUntil(today, dueDate);
  const date = `Due ${shortDate(dueDate)}`;
  if (d < 0) return { text: `Was due ${shortDate(dueDate)}`, badge: 'Past due date', date: `Was due ${shortDate(dueDate)}`, tone: 'negative' };
  if (d === 0) return { text: 'Due today', badge: 'Due today', date, tone: 'warning' };
  if (d === 1) return { text: 'Due tomorrow', badge: 'Due tomorrow', date, tone: 'warning' };
  return { text: `Due in ${d} days · ${shortDate(dueDate)}`, badge: `${d} days left`, date, tone: d <= 3 ? 'warning' : 'neutral' };
}

export const shortDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const longDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function greeting(now = new Date()): string {
  const h = Number(new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(11, 13));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const firstName = (name: string) => name.split(' ')[0] ?? name;
export const pct = (bps: number) => `${Math.round(bps / 100)}%`;

/** ₹5,00,000 → "₹5 lakh" (cover amounts read better this way). */
export const lakhs = (paise: number) => {
  const l = paise / 1_00_000_00;
  return l >= 100 ? `₹${Number((l / 100).toFixed(2))} crore` : `₹${Number(l.toFixed(1))} lakh`;
};
export const tierName = (t: string) => t[0]!.toUpperCase() + t.slice(1);
export const RELATION_LABEL: Record<string, string> = { self: 'You', spouse: 'Spouse', child: 'Child', parent: 'Parent', parent_in_law: 'Parent-in-law' };
export const rate = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
