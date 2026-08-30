import { db, ensureCatalog, type FundRow } from '../db.js';
import { BENCHMARK_CATALOG } from '../catalog.js';
import { upsertNavPoints, type NavUpsert } from '../service.js';
import { formatDate, parseDate } from '../analytics/returns.js';

/**
 * Generates plausible NAV history so the app is usable before a live scrape.
 *
 * This is development data, not real NAVs. Every point it writes is stored
 * with source 'seed' so `DELETE FROM nav_history WHERE source = 'seed'`
 * cleanly removes it once real data lands.
 */

/** Deterministic PRNG so repeated seeds produce the same history. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: uniform noise would give NAV paths with no fat tails at all. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

interface Profile { drift: number; vol: number; startNav: number }

/** Annual drift and volatility roughly typical of each ULIP fund class. */
const PROFILES: Record<string, Profile> = {
  equity:   { drift: 0.13, vol: 0.17, startNav: 10 },
  index:    { drift: 0.12, vol: 0.18, startNav: 10 },
  balanced: { drift: 0.10, vol: 0.09, startNav: 10 },
  debt:     { drift: 0.07, vol: 0.035, startNav: 10 },
  liquid:   { drift: 0.06, vol: 0.006, startNav: 10 },
};

function isBusinessDay(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day !== 0 && day !== 6;
}

function businessDays(fromIso: string, toIso: string): string[] {
  const days: string[] = [];
  for (let ms = parseDate(fromIso); ms <= parseDate(toIso); ms += 86_400_000) {
    if (isBusinessDay(ms)) days.push(formatDate(ms));
  }
  return days;
}

function geometricPath(
  dates: string[],
  profile: Profile,
  rand: () => number,
): number[] {
  const dt = 1 / 252;
  const path: number[] = [];
  let nav = profile.startNav;
  for (let i = 0; i < dates.length; i++) {
    if (i > 0) {
      const shock = (profile.drift - 0.5 * profile.vol ** 2) * dt +
        profile.vol * Math.sqrt(dt) * gaussian(rand);
      nav *= Math.exp(shock);
    }
    path.push(Number(nav.toFixed(4)));
  }
  return path;
}

export interface SeedOptions {
  /** How far back to generate. Funds younger than this start at inception. */
  years?: number;
  endDate?: string;
  /** Slugs to flag as managed by the app's owner. */
  managedSlugs?: string[];
}

export function seedSyntheticHistory(options: SeedOptions = {}): {
  fundsSeeded: number;
  pointsWritten: number;
} {
  ensureCatalog();
  const years = options.years ?? 8;
  const endDate = options.endDate ?? formatDate(Date.now());
  const globalStart = formatDate(parseDate(endDate) - years * 365.25 * 86_400_000);

  const funds = db.prepare(`SELECT * FROM funds WHERE is_active = 1`).all() as FundRow[];
  const points: NavUpsert[] = [];
  let fundsSeeded = 0;

  for (const fund of funds) {
    const inception = fund.inception_date;
    const start = inception && inception > globalStart ? inception : globalStart;
    if (start > endDate) continue; // fund launches after the window

    const dates = businessDays(start, endDate);
    if (dates.length < 2) continue;

    const profile = PROFILES[fund.category] ?? PROFILES.equity!;
    // Seed from the fund id so each fund gets its own repeatable path.
    const rand = mulberry32(fund.id * 7919 + 13);
    const path = geometricPath(dates, profile, rand);

    dates.forEach((date, i) => {
      points.push({ fundId: fund.id, date, nav: path[i]!, source: 'seed' });
    });
    fundsSeeded++;
  }

  // Benchmarks get the same treatment so fund-vs-benchmark charts have a line
  // to draw against.
  const benchmarkProfiles: Record<string, string> = {
    NIFTY50: 'equity', NIFTY500: 'equity',
    NIFTYMIDCAP150: 'equity', NIFTYSMALLCAP250: 'equity',
    CRISILBOND: 'debt', CRISILLIQUID: 'liquid', CRISILHYBRID: 'balanced',
  };
  const insertBenchmarkPoint = db.prepare(`
    INSERT INTO benchmark_history (benchmark_id, date, value) VALUES (?, ?, ?)
    ON CONFLICT(benchmark_id, date) DO UPDATE SET value = excluded.value
  `);
  db.transaction(() => {
    for (const [index, benchmark] of BENCHMARK_CATALOG.entries()) {
      const row = db.prepare(`SELECT id FROM benchmarks WHERE code = ?`).get(benchmark.code) as
        | { id: number }
        | undefined;
      if (!row) continue;
      const dates = businessDays(globalStart, endDate);
      const profile = PROFILES[benchmarkProfiles[benchmark.code] ?? 'equity']!;
      const path = geometricPath(dates, { ...profile, startNav: 100 }, mulberry32(index * 104729 + 7));
      dates.forEach((date, i) => insertBenchmarkPoint.run(row.id, date, path[i]!));
    }
  })();

  const pointsWritten = upsertNavPoints(points);

  const managed = options.managedSlugs ?? [];
  if (managed.length) {
    const stmt = db.prepare(`UPDATE funds SET is_managed = 1 WHERE slug = ?`);
    db.transaction(() => { for (const slug of managed) stmt.run(slug); })();
  }

  // Give each fund an AUM figure so the dashboard has something to show.
  const aumStmt = db.prepare(`UPDATE funds SET aum_cr = ? WHERE id = ? AND aum_cr IS NULL`);
  db.transaction(() => {
    for (const fund of funds) {
      const rand = mulberry32(fund.id * 31 + 5);
      aumStmt.run(Number((50 + rand() * 3200).toFixed(2)), fund.id);
    }
  })();

  return { fundsSeeded, pointsWritten };
}
