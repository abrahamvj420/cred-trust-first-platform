import { adminTheme, themeVars } from '@cred/ui/themes';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Nav } from './_nav';
import './globals.css';

const brandFont = Inter({ subsets: ['latin'], variable: '--font-brand' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-brand-mono' });

export const metadata: Metadata = { title: 'CRED Console', description: 'CRED internal console (prototype)' };
export const viewport: Viewport = { themeColor: adminTheme.colors.bg };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${brandFont.variable} ${monoFont.variable} bg-bg text-text`} style={themeVars(adminTheme)}>
        <div className="flex min-h-dvh">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
