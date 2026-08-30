import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { FUND_CATALOG, BENCHMARK_CATALOG } from './catalog.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS funds (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sfin           TEXT UNIQUE,
  sfin_verified  INTEGER NOT NULL DEFAULT 0,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  category       TEXT NOT NULL,
  benchmark      TEXT,
  inception_date TEXT,
  aum_cr         REAL,
  is_managed     INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nav_history (
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  nav     REAL NOT NULL,
  source  TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (fund_id, date)
);
CREATE INDEX IF NOT EXISTS idx_nav_history_date ON nav_history(date);

CREATE TABLE IF NOT EXISTS benchmarks (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_history (
  benchmark_id INTEGER NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  value        REAL NOT NULL,
  PRIMARY KEY (benchmark_id, date)
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL,
  funds_updated INTEGER NOT NULL DEFAULT 0,
  message       TEXT
);
`);

/** Inserts any catalog funds/benchmarks that are not in the database yet. */
export function ensureCatalog(): void {
  const insertFund = db.prepare(`
    INSERT INTO funds (sfin, sfin_verified, name, slug, category, benchmark, inception_date)
    VALUES (@sfin, @sfinVerified, @name, @slug, @category, @benchmark, @inceptionDate)
    ON CONFLICT(slug) DO NOTHING
  `);
  const insertBenchmark = db.prepare(
    `INSERT INTO benchmarks (code, name) VALUES (?, ?) ON CONFLICT(code) DO NOTHING`,
  );

  db.transaction(() => {
    for (const fund of FUND_CATALOG) {
      insertFund.run({ ...fund, sfinVerified: fund.sfinVerified ? 1 : 0 });
    }
    for (const b of BENCHMARK_CATALOG) {
      insertBenchmark.run(b.code, b.name);
    }
  })();
}

export interface FundRow {
  id: number;
  sfin: string | null;
  sfin_verified: number;
  name: string;
  slug: string;
  category: string;
  benchmark: string | null;
  inception_date: string | null;
  aum_cr: number | null;
  is_managed: number;
  is_active: number;
  updated_at: string;
}
