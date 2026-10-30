import { insurerTheme, themeVars } from '@cred/ui/themes';
import type { Metadata } from 'next';
import { Nunito_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

const brandFont = Nunito_Sans({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'Sahaj Health Insurance' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${brandFont.variable} min-h-dvh bg-bg font-sans text-text`} style={themeVars(insurerTheme)}>
      {children}
    </div>
  );
}
