import { themes, themeVars, type BrandTheme } from '@cred/ui/themes';

const worlds: { href: string; theme: BrandTheme; what: string }[] = [
  { href: '/bank', theme: themes.mockbank, what: 'Net banking, card statements, salary credits' },
  { href: '/upi', theme: themes.upi, what: 'UPI IDs, payments and PIN approval' },
  { href: '/aa', theme: themes.aa, what: 'Consents: who sees what, for how long' },
  { href: '/insurer', theme: themes.insurer, what: 'Policies and claims' },
  { href: '/fundhouse', theme: themes.fundhouse, what: 'Folios and liens' },
  { href: '/lender', theme: themes.lender, what: 'Loans, EMIs and repayment plans' },
  { href: '/health', theme: themes.health, what: 'Daily activity (stays on the phone)' },
];

/** Directory of the outside world. Each tile renders in its own institution's brand. */
export default function Directory() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">The outside world</h1>
        <p className="text-sm">Every institution CRED works with, simulated. Each has its own systems and talks to CRED only through signed messages and consented data.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {worlds.map((w) => (
          <li key={w.href} style={themeVars(w.theme)}>
            <a href={w.href} className="block rounded-md border border-border bg-surface p-5 text-text hover:border-accent">
              <span className="block font-semibold text-accent">{w.theme.displayName}</span>
              <span className="text-sm text-muted">{w.what}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
