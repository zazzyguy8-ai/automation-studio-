import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Pricebird — price it, then list it',
    template: '%s · Pricebird',
  },
  description:
    'Photograph anything you are selling. Get a price range and a finished listing - title, description '
    + 'and keywords - for eBay, Vinted, Depop, Facebook Marketplace, Poshmark, Mercari or Etsy.',
  openGraph: {
    title: 'Pricebird — price it, then list it',
    description: 'Snap it. Price it. List it. A phone photo becomes a priced marketplace listing in about twenty seconds.',
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
