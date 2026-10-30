import { fundhouseTheme, themeVars } from '@cred/ui/themes';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

const brandFont = DM_Sans({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'Meridian Mutual Fund' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${brandFont.variable} min-h-dvh bg-bg font-sans text-text`} style={themeVars(fundhouseTheme)}>
      {children}
    </div>
  );
}
