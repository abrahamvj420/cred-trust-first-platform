import { credTheme, themeVars } from '@cred/ui/themes';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { LiveProvider } from '@/lib/live';
import './globals.css';

const brandFont = Manrope({ subsets: ['latin'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'CRED (prototype)', description: 'Trust-first member app: synthetic data, class prototype' };
export const viewport: Viewport = { themeColor: credTheme.colors.bg, width: 'device-width', initialScale: 1 };

/** Mobile-first: a 390px phone frame, centred on larger screens. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${brandFont.variable} bg-bg text-text sm:bg-surface`} style={themeVars(credTheme)}>
        <LiveProvider>
          <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-bg sm:my-8 sm:min-h-[844px] sm:overflow-hidden sm:rounded-xl sm:border sm:border-border sm:shadow-e2">
            {children}
          </div>
        </LiveProvider>
      </body>
    </html>
  );
}
