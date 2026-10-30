import { aaTheme, themeVars } from '@cred/ui/themes';
import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

const brandFont = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'SimAA Account Aggregator' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${brandFont.variable} min-h-dvh bg-bg font-sans text-text`} style={themeVars(aaTheme)}>
      {children}
    </div>
  );
}
