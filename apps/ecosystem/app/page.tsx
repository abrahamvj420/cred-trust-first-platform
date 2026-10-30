import { themes, themeVars, type BrandTheme } from '@cred/ui/themes';

const worlds: { href: string; theme: BrandTheme; what: string }[] = [
  { href: '/bank', theme: themes.mockbank, what: 'Card OTP, statements, salary credits' },
  { href: '/upi', theme: themes.upi, what: 'UPI PIN approval' },
  { href: '/aa', theme: themes.aa, what: 'Account Aggregator consent' },
  { href: '/insurer', theme: themes.insurer, what: 'Policies and claims' },
  { href: '/fundhouse', theme: themes.fundhouse, what: 'Folios and liens' },
];

/** Directory of the outside world. Each tile renders in its own institution's brand. */
export default function Directory() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Ecosystem</h1>
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
