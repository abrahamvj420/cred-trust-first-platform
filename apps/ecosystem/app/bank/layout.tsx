import { mockbankTheme, themeVars } from '@cred/ui/themes';
import type { Metadata } from 'next';
import { Source_Sans_3 } from 'next/font/google';
import type { ReactNode } from 'react';

const brandFont = Source_Sans_3({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'Mock Bank' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${brandFont.variable} min-h-dvh bg-bg font-sans text-text`} style={themeVars(mockbankTheme)}>
      {children}
    </div>
  );
}
