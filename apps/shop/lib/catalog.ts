export type Category = 'computers' | 'phones-audio' | 'home' | 'fashion';

export interface Product {
  slug: string;
  name: string;
  brand: string;
  category: Category;
  pricePaise: number;
  mrpPaise: number;
  rating: number;
  reviews: number;
  blurb: string;
  specs: string[];
  /** Short mark shown on the product tile (no product photos in the demo). */
  mark: string;
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'computers', label: 'Laptops & monitors' },
  { id: 'phones-audio', label: 'Phones & audio' },
  { id: 'home', label: 'Home & kitchen' },
  { id: 'fashion', label: 'Fashion & travel' },
];

/** Static demo catalogue: synthetic brands and products. */
export const PRODUCTS: Product[] = [
  { slug: 'aero-14', name: 'Aero 14 Laptop · 16 GB · 1 TB', brand: 'Aero', category: 'computers', pricePaise: 1_50_000_00, mrpPaise: 1_69_990_00, rating: 4.6, reviews: 2184, mark: 'A14', blurb: 'A 14-inch ultralight with an all-day battery and a 2.8K display.', specs: ['14" 2.8K 120 Hz display', '16 GB RAM, 1 TB SSD', '18-hour battery', '1.2 kg'] },
  { slug: 'studio-27', name: 'Studio 27 4K Monitor', brand: 'Lumen', category: 'computers', pricePaise: 38_500_00, mrpPaise: 44_999_00, rating: 4.5, reviews: 812, mark: '27"', blurb: 'Colour-accurate 27-inch 4K monitor with USB-C power delivery.', specs: ['27" 4K IPS', '99% sRGB', '90 W USB-C', 'Height-adjustable stand'] },
  { slug: 'usb-c-cable', name: 'Braided USB-C Cable · 2 m', brand: 'Tether', category: 'computers', pricePaise: 2_000_00, mrpPaise: 2_499_00, rating: 4.3, reviews: 5310, mark: 'C', blurb: 'Braided 100 W cable that survives a backpack.', specs: ['2 m braided', '100 W charging', '10 Gbps data'] },
  { slug: 'nova-phone', name: 'Nova 8 Smartphone · 256 GB', brand: 'Nova', category: 'phones-audio', pricePaise: 64_999_00, mrpPaise: 71_999_00, rating: 4.4, reviews: 3920, mark: 'N8', blurb: 'A bright 6.5-inch display, a 50 MP camera and two-day battery.', specs: ['6.5" OLED 120 Hz', '50 MP main camera', '256 GB storage', '5,000 mAh'] },
  { slug: 'pulse-buds', name: 'Pulse Buds Pro · Noise cancelling', brand: 'Pulse', category: 'phones-audio', pricePaise: 8_999_00, mrpPaise: 12_999_00, rating: 4.2, reviews: 7465, mark: 'PB', blurb: 'Adaptive noise cancelling with 30 hours of battery in the case.', specs: ['Active noise cancelling', '30 h with case', 'IPX4', 'Bluetooth 5.3'] },
  { slug: 'stride-watch', name: 'Stride Watch 3 · GPS', brand: 'Stride', category: 'phones-audio', pricePaise: 18_999_00, mrpPaise: 21_999_00, rating: 4.3, reviews: 1508, mark: 'S3', blurb: 'Tracks steps, sleep and workouts; syncs with your health app.', specs: ['1.4" AMOLED', 'Built-in GPS', '10-day battery', 'Works with Apple Health and Health Connect'] },
  { slug: 'brew-one', name: 'Brew One Espresso Machine', brand: 'Brewline', category: 'home', pricePaise: 24_500_00, mrpPaise: 29_990_00, rating: 4.5, reviews: 640, mark: 'B1', blurb: '15-bar espresso with a steam wand for cafe-style milk.', specs: ['15 bar pump', 'Steam wand', '1.5 L tank', '2-year warranty'] },
  { slug: 'clearair', name: 'ClearAir 400 Air Purifier', brand: 'ClearAir', category: 'home', pricePaise: 16_999_00, mrpPaise: 19_999_00, rating: 4.4, reviews: 2210, mark: 'CA', blurb: 'HEPA H13 purifier for rooms up to 400 sq ft, whisper quiet at night.', specs: ['HEPA H13 + carbon', '400 sq ft', '24 dB sleep mode', 'App control'] },
  { slug: 'ergo-chair', name: 'Ergo Pro Desk Chair', brand: 'Seatwell', category: 'home', pricePaise: 21_000_00, mrpPaise: 27_500_00, rating: 4.2, reviews: 980, mark: 'EP', blurb: 'Adjustable lumbar support and breathable mesh for long days.', specs: ['Adjustable lumbar', '4D armrests', 'Mesh back', '120 kg rated'] },
  { slug: 'trail-pack', name: 'Trail 28 L Backpack', brand: 'Northline', category: 'fashion', pricePaise: 3_499_00, mrpPaise: 4_999_00, rating: 4.6, reviews: 4120, mark: '28L', blurb: 'Water-resistant daypack with a padded 16-inch laptop sleeve.', specs: ['28 litres', '16" laptop sleeve', 'Water-resistant', 'Lifetime zips'] },
  { slug: 'runner-x', name: 'Runner X Running Shoes', brand: 'Stride', category: 'fashion', pricePaise: 6_499_00, mrpPaise: 8_999_00, rating: 4.3, reviews: 3330, mark: 'RX', blurb: 'Light, cushioned trainers for everyday runs.', specs: ['Foam midsole', '240 g', 'Breathable knit', 'Sizes 6–12'] },
  { slug: 'cabin-spinner', name: 'Cabin Spinner Suitcase · 55 cm', brand: 'Northline', category: 'fashion', pricePaise: 7_999_00, mrpPaise: 11_999_00, rating: 4.4, reviews: 1890, mark: '55', blurb: 'Polycarbonate cabin bag with a TSA lock and silent wheels.', specs: ['55 cm cabin size', 'Polycarbonate shell', 'TSA lock', '8 spinner wheels'] },
];

export const productBySlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug);
export const discountPct = (p: Product) => Math.round(((p.mrpPaise - p.pricePaise) * 100) / p.mrpPaise);
