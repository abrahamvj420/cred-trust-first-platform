import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = { title: 'Ecosystem', description: 'The simulated outside world around CRED' };

/** No brand at the root: each route segment applies its own institution's theme. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
