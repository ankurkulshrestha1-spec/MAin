import { db } from '../db.js';
import { config } from '../config.js';
import { upsertNavPoints, type NavUpsert } from '../service.js';
import type { FundRow } from '../db.js';
import { parseFundTable, parsePageNavDate, type ScrapedFund } from './parse.js';

export interface ScrapeResult {
  status: 'success' | 'partial' | 'failed';
  fundsUpdated: number;
  fundsSeen: number;
  unmatched: string[];
  message: string | null;
}

/** Strips punctuation and the issuer prefix so "PNB MetLife Virtue II" matches "Virtue II". */
function matchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/pnb\s*met\s*life|pnbmetlife|metlife/g, '')
    .replace(/\bfund\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      // Some insurer sites serve a stub page to clients without a browser UA.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Reconciles one scraped row against the fund table.
 *
 * SFIN is the reliable identifier and is tried first; name matching is the
 * fallback for rows where the page omits the code. A scraped fund matching
 * nothing is inserted rather than dropped, so a newly launched fund starts
 * accumulating NAV history the day it appears.
 */
function resolveFund(scraped: ScrapedFund, funds: FundRow[]): FundRow | null {
  if (scraped.sfin) {
    const bySfin = funds.find((f) => f.sfin === scraped.sfin);
    if (bySfin) return bySfin;
  }
  const key = matchKey(scraped.name);
  if (!key) return null;
  return (
    funds.find((f) => matchKey(f.name) === key) ??
    funds.find((f) => matchKey(f.name).startsWith(key) || key.startsWith(matchKey(f.name))) ??
    null
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/pnb\s*met\s*life/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function scrapeNavs(html?: string): Promise<ScrapeResult> {
  const runId = db
    .prepare(
      `INSERT INTO scrape_runs (started_at, status) VALUES (datetime('now'), 'running')`,
    )
    .run().lastInsertRowid as number;

  const finish = (result: ScrapeResult) => {
    db.prepare(
      `UPDATE scrape_runs SET finished_at = datetime('now'), status = ?, funds_updated = ?, message = ? WHERE id = ?`,
    ).run(result.status, result.fundsUpdated, result.message, runId);
    return result;
  };

  let page: string;
  try {
    page = html ?? (await fetchPage(config.allFundsUrl));
  } catch (error) {
    return finish({
      status: 'failed',
      fundsUpdated: 0,
      fundsSeen: 0,
      unmatched: [],
      message: `Fetch failed: ${(error as Error).message}`,
    });
  }

  const scraped = parseFundTable(page);
  if (!scraped.length) {
    return finish({
      status: 'failed',
      fundsUpdated: 0,
      fundsSeen: 0,
      unmatched: [],
      message:
        'No NAV table found on the page. The layout may have changed — run `npm run scrape -- --dump` to save the HTML and inspect it.',
    });
  }

  const fallbackDate = parsePageNavDate(page);
  const funds = db.prepare(`SELECT * FROM funds`).all() as FundRow[];
  const points: NavUpsert[] = [];
  const unmatched: string[] = [];

  const insertFund = db.prepare(`
    INSERT INTO funds (sfin, sfin_verified, name, slug, category, benchmark)
    VALUES (?, ?, ?, ?, 'equity', NULL)
  `);
  const updateFund = db.prepare(`
    UPDATE funds SET sfin = COALESCE(?, sfin), sfin_verified = MAX(sfin_verified, ?),
      aum_cr = COALESCE(?, aum_cr), updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const row of scraped) {
    const date = row.navDate ?? fallbackDate;
    if (!date || row.nav === null) {
      unmatched.push(`${row.name} (no usable NAV date)`);
      continue;
    }

    let fund = resolveFund(row, funds);
    if (!fund) {
      // Unknown fund: record it so its history starts now. Category defaults to
      // equity and is left for the operator to correct via the API.
      const id = insertFund.run(
        row.sfin,
        row.sfin ? 1 : 0,
        row.name,
        slugify(row.name) || `fund-${Date.now()}`,
      ).lastInsertRowid as number;
      fund = db.prepare(`SELECT * FROM funds WHERE id = ?`).get(id) as FundRow;
      funds.push(fund);
      unmatched.push(`${row.name} (added as new fund #${id}, set its category)`);
    } else {
      updateFund.run(row.sfin, row.sfin ? 1 : 0, row.aumCr, fund.id);
    }

    points.push({ fundId: fund.id, date, nav: row.nav, source: 'scrape' });
  }

  const fundsUpdated = upsertNavPoints(points);
  return finish({
    status: unmatched.length ? 'partial' : 'success',
    fundsUpdated,
    fundsSeen: scraped.length,
    unmatched,
    message: unmatched.length ? `${unmatched.length} row(s) needed attention` : null,
  });
}
