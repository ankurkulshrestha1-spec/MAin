import { db } from './db.js';
import { upsertNavPoints, type NavUpsert } from './service.js';
import type { FundRow } from './db.js';
import { parseIndianDate, parseNumber } from './scrape/parse.js';

export interface CsvImportResult {
  rowsRead: number;
  navPointsWritten: number;
  errors: string[];
}

/** Minimal RFC4180 splitter — handles quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { out.push(field); field = ''; }
    else field += char;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function headerIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((h) => patterns.some((p) => p.test(h)));
}

/**
 * Imports NAV history from a CSV export.
 *
 * Expected columns (matched by header name, order-independent):
 *   fund | fund name | sfin   — identifies the fund
 *   date                      — DD/MM/YYYY, DD-MMM-YYYY or YYYY-MM-DD
 *   nav                       — numeric
 *
 * Rows naming a fund that is not in the database are reported as errors
 * rather than silently creating funds, since a typo in an internal export
 * should not quietly add a phantom fund to the tracker.
 */
export function importNavCsv(content: string): CsvImportResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  if (lines.length < 2) {
    return { rowsRead: 0, navPointsWritten: 0, errors: ['CSV has no data rows'] };
  }

  const headers = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const nameIdx = headerIndex(headers, [/fund\s*name/, /^fund$/, /^name$/, /scheme/]);
  const sfinIdx = headerIndex(headers, [/sfin/, /fund\s*code/]);
  const dateIdx = headerIndex(headers, [/date/, /as\s*on/]);
  const navIdx = headerIndex(headers, [/^nav$/, /net\s*asset/, /^nav\b/]);

  if (dateIdx === -1 || navIdx === -1 || (nameIdx === -1 && sfinIdx === -1)) {
    return {
      rowsRead: 0,
      navPointsWritten: 0,
      errors: [
        `Could not find required columns. Need a date column, a nav column, and a fund name or sfin column. Saw: ${headers.join(', ')}`,
      ],
    };
  }

  const funds = db.prepare(`SELECT * FROM funds`).all() as FundRow[];
  const bySfin = new Map(funds.filter((f) => f.sfin).map((f) => [f.sfin!.toUpperCase(), f]));
  const byName = new Map(funds.map((f) => [normaliseName(f.name), f]));
  const bySlug = new Map(funds.map((f) => [f.slug, f]));

  const points: NavUpsert[] = [];
  let rowsRead = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    rowsRead++;

    const sfin = sfinIdx !== -1 ? cells[sfinIdx]?.toUpperCase() ?? '' : '';
    const name = nameIdx !== -1 ? cells[nameIdx] ?? '' : '';
    const fund =
      (sfin && bySfin.get(sfin)) ||
      byName.get(normaliseName(name)) ||
      bySlug.get(name.toLowerCase());

    if (!fund) {
      errors.push(`Row ${i + 1}: no fund matches "${name || sfin}"`);
      continue;
    }

    const date = parseIndianDate(cells[dateIdx] ?? '');
    const nav = parseNumber(cells[navIdx] ?? '');
    if (!date) { errors.push(`Row ${i + 1}: unreadable date "${cells[dateIdx]}"`); continue; }
    if (nav === null || nav <= 0) { errors.push(`Row ${i + 1}: unreadable NAV "${cells[navIdx]}"`); continue; }

    points.push({ fundId: fund.id, date, nav, source: 'csv' });
  }

  return { rowsRead, navPointsWritten: upsertNavPoints(points), errors };
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/pnb\s*met\s*life/g, '').replace(/[^a-z0-9]/g, '');
}
