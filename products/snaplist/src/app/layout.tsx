import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Snaplist — photo in, listing out',
    template: '%s · Snaplist',
  },
  description:
    'Photograph the thing you are selling. Get the title, the description, the price range and the keywords, '
    + 'written for eBay, Vinted, Depop, Facebook Marketplace, Poshmark, Mercari or Etsy.',
  openGraph: {
    title: 'Snaplist — photo in, listing out',
    description: 'Turn a phone photo into a marketplace listing in about twenty seconds.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#07070a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
