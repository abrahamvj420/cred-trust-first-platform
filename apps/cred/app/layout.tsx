import { credTheme, themeVars } from '@cred/ui/themes';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const brandFont = Manrope({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'CRED', description: 'CRED member app (prototype)' };
export const viewport: Viewport = { themeColor: credTheme.colors.bg };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${brandFont.variable} bg-bg text-text`} style={themeVars(credTheme)}>
        {children}
      </body>
    </html>
  );
}
