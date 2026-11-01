import { healthTheme, themeVars } from '@cred/ui/themes';
import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import type { ReactNode } from 'react';

const brandFont = Rubik({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'Health' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${brandFont.variable} min-h-dvh bg-bg font-sans text-text`} style={themeVars(healthTheme)}>
      {children}
    </div>
  );
}
