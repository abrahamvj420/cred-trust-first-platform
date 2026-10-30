import { adminTheme, themeVars } from '@cred/ui/themes';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const brandFont = Inter({ subsets: ['latin'], variable: '--font-brand' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-brand-mono' });

export const metadata: Metadata = { title: 'CRED Console', description: 'CRED internal console (prototype)' };
export const viewport: Viewport = { themeColor: adminTheme.colors.bg };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${brandFont.variable} ${monoFont.variable} bg-bg text-text`} style={themeVars(adminTheme)}>
        <nav className="flex items-center gap-6 border-b border-border px-6 py-3 text-sm">
          <span className="font-semibold">CRED Console</span>
          <a className="text-muted hover:text-text" href="/">Overview</a>
          <a className="text-muted hover:text-text" href="/demo">Demo</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
