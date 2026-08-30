import type { FundCategory } from './types.js';

export interface CatalogEntry {
  name: string;
  slug: string;
  sfin: string | null;
  /**
   * true  -> SFIN confirmed against a PNB MetLife / public source.
   * false -> fund is real but its SFIN still needs confirming from the
   *          official factsheet. The scraper overwrites this once it reads
   *          the SFIN off the live page.
   */
  sfinVerified: boolean;
  category: FundCategory;
  benchmark: string | null;
  inceptionDate: string | null;
}

/**
 * Seed catalog of PNB MetLife unit-linked (ULIP) funds.
 *
 * This is a starting point, not the source of truth: the scraper reconciles it
 * against the live fund-performance page on every run, inserting funds it has
 * not seen and filling in missing SFIN codes. Names use PNB MetLife's own
 * wording so scraped rows match by name when a SFIN is absent.
 */
export const FUND_CATALOG: CatalogEntry[] = [
  // --- Series I (2005 vintage) ---
  {
    name: 'PNB MetLife Preserver Fund',
    slug: 'preserver',
    sfin: 'ULIF00125/01/05PRESERVERF117',
    sfinVerified: true,
    category: 'liquid',
    benchmark: 'CRISIL Liquid Fund Index',
    inceptionDate: '2005-01-25',
  },
  {
    name: 'PNB MetLife Protector Fund',
    slug: 'protector',
    sfin: null,
    sfinVerified: false,
    category: 'debt',
    benchmark: 'CRISIL Composite Bond Fund Index',
    inceptionDate: '2005-01-25',
  },
  {
    name: 'PNB MetLife Balancer Fund',
    slug: 'balancer',
    sfin: 'ULIF00425/01/05BALANCERFN117',
    sfinVerified: true,
    category: 'balanced',
    benchmark: 'CRISIL Hybrid 35+65 Aggressive Index',
    inceptionDate: '2005-01-25',
  },
  {
    name: 'PNB MetLife Accelerator Fund',
    slug: 'accelerator',
    sfin: 'ULIF00525/01/05ACCELERATO117',
    sfinVerified: true,
    category: 'balanced',
    benchmark: 'CRISIL Hybrid 35+65 Aggressive Index',
    inceptionDate: '2005-01-25',
  },
  {
    name: 'PNB MetLife Multiplier Fund',
    slug: 'multiplier',
    sfin: 'ULIF00625/01/05MULTIPLIER117',
    sfinVerified: true,
    category: 'equity',
    benchmark: 'NIFTY 50',
    inceptionDate: '2005-01-25',
  },
  {
    name: 'PNB MetLife Virtue Fund',
    slug: 'virtue',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY 500',
    inceptionDate: '2007-01-08',
  },

  // --- Series II (2009 vintage) ---
  {
    name: 'PNB MetLife Preserver Fund II',
    slug: 'preserver-ii',
    sfin: 'ULIF00815/12/09PRESERVER2117',
    sfinVerified: true,
    category: 'liquid',
    benchmark: 'CRISIL Liquid Fund Index',
    inceptionDate: '2009-12-15',
  },
  {
    name: 'PNB MetLife Protector Fund II',
    slug: 'protector-ii',
    sfin: 'ULIF00915/12/09PROTECTOR2117',
    sfinVerified: true,
    category: 'debt',
    benchmark: 'CRISIL Composite Bond Fund Index',
    inceptionDate: '2009-12-15',
  },
  {
    name: 'PNB MetLife Balancer Fund II',
    slug: 'balancer-ii',
    sfin: 'ULIF01015/12/09BALANCER2F117',
    sfinVerified: true,
    category: 'balanced',
    benchmark: 'CRISIL Hybrid 35+65 Aggressive Index',
    inceptionDate: '2009-12-15',
  },
  {
    name: 'PNB MetLife Multiplier Fund II',
    slug: 'multiplier-ii',
    sfin: 'ULIF01115/12/09MULTIPLIE2117',
    sfinVerified: true,
    category: 'equity',
    benchmark: 'NIFTY 50',
    inceptionDate: '2009-12-15',
  },
  {
    name: 'PNB MetLife Virtue II',
    slug: 'virtue-ii',
    sfin: 'ULIF01215/12/09VIRTUE2FND117',
    sfinVerified: true,
    category: 'equity',
    benchmark: 'NIFTY 500',
    inceptionDate: '2009-12-21',
  },

  // --- Later diversified equity / debt funds ---
  {
    name: 'PNB MetLife Flexi Cap Fund',
    slug: 'flexi-cap',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY 500',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Premier Multi-Cap Fund',
    slug: 'premier-multi-cap',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY 500 Multicap 50:25:25',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Mid Cap Fund',
    slug: 'mid-cap',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY Midcap 150',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Small Cap Fund',
    slug: 'small-cap',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY Smallcap 250',
    inceptionDate: '2024-02-20',
  },
  {
    name: 'PNB MetLife India Multiplier',
    slug: 'india-multiplier',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY 50',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Value Fund',
    slug: 'value-fund',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY 500',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Pension Value Fund',
    slug: 'pension-value',
    sfin: null,
    sfinVerified: false,
    category: 'balanced',
    benchmark: 'CRISIL Hybrid 35+65 Aggressive Index',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Bond Opportunities Fund',
    slug: 'bond-opportunities',
    sfin: null,
    sfinVerified: false,
    category: 'debt',
    benchmark: 'CRISIL Composite Bond Fund Index',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife Liquid Fund',
    slug: 'liquid',
    sfin: null,
    sfinVerified: false,
    category: 'liquid',
    benchmark: 'CRISIL Liquid Fund Index',
    inceptionDate: null,
  },

  // --- Thematic / index funds ---
  {
    name: 'PNB MetLife Bharat Manufacturing Fund',
    slug: 'bharat-manufacturing',
    sfin: null,
    sfinVerified: false,
    category: 'equity',
    benchmark: 'NIFTY India Manufacturing',
    inceptionDate: '2024-07-31',
  },
  {
    name: 'PNB MetLife Nifty 500 Momentum 50 Index Fund',
    slug: 'nifty-500-momentum-50',
    sfin: 'ULIF03115/02/25NIFTYMOMEN117',
    sfinVerified: true,
    category: 'index',
    benchmark: 'NIFTY 500 Momentum 50',
    inceptionDate: '2025-02-15',
  },
  {
    name: 'PNB MetLife Dividend Leaders Index Fund',
    slug: 'dividend-leaders-index',
    sfin: null,
    sfinVerified: false,
    category: 'index',
    benchmark: 'NIFTY Dividend Opportunities 50',
    inceptionDate: null,
  },
  {
    name: 'PNB MetLife BSE 500 Enhanced Value 50 Index Fund',
    slug: 'enhanced-value-index',
    sfin: 'ULIF04301/07/26ENHANVALUE117',
    sfinVerified: true,
    category: 'index',
    benchmark: 'BSE 500 Enhanced Value 50',
    inceptionDate: '2026-07-01',
  },
  {
    name: 'PNB MetLife Multifactor Index Fund',
    slug: 'multifactor-index',
    sfin: null,
    sfinVerified: false,
    category: 'index',
    benchmark: 'NIFTY 500 Multifactor MQVLv 50',
    inceptionDate: null,
  },
];

export const BENCHMARK_CATALOG = [
  { code: 'NIFTY50', name: 'NIFTY 50' },
  { code: 'NIFTY500', name: 'NIFTY 500' },
  { code: 'NIFTYMIDCAP150', name: 'NIFTY Midcap 150' },
  { code: 'NIFTYSMALLCAP250', name: 'NIFTY Smallcap 250' },
  { code: 'CRISILBOND', name: 'CRISIL Composite Bond Fund Index' },
  { code: 'CRISILLIQUID', name: 'CRISIL Liquid Fund Index' },
  { code: 'CRISILHYBRID', name: 'CRISIL Hybrid 35+65 Aggressive Index' },
];

/** Maps a benchmark display name to its catalog code. */
export function benchmarkCode(name: string | null): string | null {
  if (!name) return null;
  const match = BENCHMARK_CATALOG.find(
    (b) => b.name.toLowerCase() === name.toLowerCase(),
  );
  return match?.code ?? null;
}
