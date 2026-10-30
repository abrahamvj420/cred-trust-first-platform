import { shopkartTheme, themeVars } from '@cred/ui/themes';
import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const brandFont = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-brand' });

export const metadata: Metadata = { title: 'ShopKart', description: 'ShopKart demo store' };
export const viewport: Viewport = { themeColor: shopkartTheme.colors.bg };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${brandFont.variable} bg-bg text-text`} style={themeVars(shopkartTheme)}>
        {children}
      </body>
    </html>
  );
}
