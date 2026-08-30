import * as cheerio from 'cheerio';

export interface ScrapedFund {
  name: string;
  sfin: string | null;
  nav: number | null;
  navDate: string | null;
  aumCr: number | null;
}

/** SFIN codes look like ULIF01215/12/09VIRTUE2FND117. */
const SFIN_RE = /ULIF\d{3}\d{2}\/\d{2}\/\d{2}[A-Z0-9]+\d{3}/i;

/**
 * Header keywords used to identify each column, most specific first.
 *
 * Order is load-bearing: a "NAV Date" heading matches both the date and the
 * NAV patterns, so the date entry has to be tested first or the date column
 * gets read as the NAV column.
 */
const COLUMN_MATCHERS: ReadonlyArray<[keyof ScrapedFund, RegExp[]]> = [
  ['navDate', [/nav\s*date/i, /^date\b/i, /as\s*on/i, /valuation\s*date/i]],
  ['sfin', [/sfin/i, /fund\s*code/i, /ulif/i]],
  ['aumCr', [/aum/i, /assets?\s*under/i, /fund\s*size/i, /corpus/i]],
  ['nav', [/^nav\b/i, /net\s*asset\s*value/i, /nav\s*[(₹]/i]],
  ['name', [/fund\s*name/i, /^fund$/i, /^name$/i, /scheme/i]],
];

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Parses "1,234.56", "₹ 70.46", "3206.00 Cr" into a number. */
export function parseNumber(raw: string): number | null {
  const cleaned = normalise(raw)
    .replace(/[₹,]/g, '')
    .replace(/\b(cr|crore|crores|rs\.?|inr)\b/gi, '')
    .trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parses the date formats Indian fund pages use — 02/07/2026, 02-07-2026 and
 * "02 Jul 2026" — into YYYY-MM-DD. Numeric dates are read as DD/MM/YYYY,
 * which is the convention on these pages; a leading value above 12 that
 * cannot be a month is treated as the day either way.
 */
export function parseIndianDate(raw: string): string | null {
  const text = normalise(raw);
  if (!text) return null;

  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = text.match(/(\d{1,2})[\s\-/]*([A-Za-z]{3,})[\s\-/,]*(\d{2,4})/);
  if (named) {
    const month = MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    if (month) {
      const year = Number(named[3]) < 100 ? 2000 + Number(named[3]) : Number(named[3]);
      return `${year}-${String(month).padStart(2, '0')}-${named[1]!.padStart(2, '0')}`;
    }
  }

  const numeric = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function matchColumn(header: string): keyof ScrapedFund | null {
  for (const [field, patterns] of COLUMN_MATCHERS) {
    if (patterns.some((p) => p.test(header))) return field;
  }
  return null;
}

/**
 * Extracts fund NAV rows from a fund-performance page.
 *
 * Columns are located by their header text rather than by position or CSS
 * class, so the parser survives PNB MetLife reordering columns or restyling
 * the page. Every table on the page is considered; the one yielding the most
 * usable rows wins.
 */
export function parseFundTable(html: string): ScrapedFund[] {
  const $ = cheerio.load(html);
  let best: ScrapedFund[] = [];

  $('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;

    // The header is the first row containing a cell that maps to a known
    // column; some pages precede it with a title/spacer row.
    let headerIndex = -1;
    let columns: (keyof ScrapedFund | null)[] = [];
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const cells = $(rows[i]!).find('th, td').toArray().map((c) => normalise($(c).text()));
      const mapped = cells.map(matchColumn);
      if (mapped.some((m) => m === 'name') && mapped.some((m) => m === 'nav')) {
        headerIndex = i;
        columns = mapped;
        break;
      }
    }
    if (headerIndex === -1) return;

    const parsed: ScrapedFund[] = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const cells = $(row).find('td').toArray().map((c) => normalise($(c).text()));
      if (!cells.length) continue;

      const entry: ScrapedFund = { name: '', sfin: null, nav: null, navDate: null, aumCr: null };
      cells.forEach((cell, index) => {
        switch (columns[index]) {
          case 'name': entry.name = cell; break;
          case 'sfin': entry.sfin = cell.match(SFIN_RE)?.[0]?.toUpperCase() ?? null; break;
          case 'nav': entry.nav = parseNumber(cell); break;
          case 'navDate': entry.navDate = parseIndianDate(cell); break;
          case 'aumCr': entry.aumCr = parseNumber(cell); break;
          default: break;
        }
      });

      // Some layouts put the SFIN inline with the fund name instead of in
      // its own column; recover it and strip it out of the display name.
      if (!entry.sfin) {
        const inline = $(row).text().match(SFIN_RE);
        if (inline) entry.sfin = inline[0].toUpperCase();
      }
      entry.name = normalise(entry.name.replace(SFIN_RE, '').replace(/[()]/g, ' '));

      if (entry.name && entry.nav !== null && entry.nav > 0) parsed.push(entry);
    }

    if (parsed.length > best.length) best = parsed;
  });

  return best;
}

/** Page-level "NAV as on 02 Jul 2026" used when rows carry no date of their own. */
export function parsePageNavDate(html: string): string | null {
  const $ = cheerio.load(html);
  const text = normalise($('body').text());
  const match = text.match(/as\s+(?:on|of|at)\s+([\dA-Za-z\s/\-.,]{6,20})/i);
  return match ? parseIndianDate(match[1]!) : null;
}
