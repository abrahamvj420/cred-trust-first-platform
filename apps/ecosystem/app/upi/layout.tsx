import { upiTheme, themeVars } from '@cred/ui/themes';
import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import type { ReactNode } from 'react';

const brandFont = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'UPI' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={`${brandFont.variable} min-h-dvh bg-bg font-sans text-text`} style={themeVars(upiTheme)}>
      {children}
    </div>
  );
}
