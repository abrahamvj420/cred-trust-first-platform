export interface Product {
  slug: string;
  name: string;
  pricePaise: number;
  blurb: string;
  specs: string[];
}

/** Static demo catalogue (synthetic products). */
export const PRODUCTS: Product[] = [
  {
    slug: 'aero-14',
    name: 'Aero 14 Laptop · 16 GB · 1 TB',
    pricePaise: 1_50_000_00,
    blurb: 'A 14-inch ultralight with an all-day battery and a 2.8K display.',
    specs: ['14" 2.8K 120 Hz display', '16 GB RAM, 1 TB SSD', '18-hour battery', '1.2 kg'],
  },
  {
    slug: 'studio-27',
    name: 'Studio 27 4K Monitor',
    pricePaise: 38_500_00,
    blurb: 'Colour-accurate 27-inch 4K monitor with USB-C power delivery.',
    specs: ['27" 4K IPS', '99% sRGB', '90 W USB-C', 'Height-adjustable stand'],
  },
  {
    slug: 'usb-c-cable',
    name: 'Braided USB-C Cable · 2 m',
    pricePaise: 2_000_00,
    blurb: 'Braided 100 W cable that survives a backpack.',
    specs: ['2 m braided', '100 W charging', '10 Gbps data'],
  },
];

export const productBySlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug);
