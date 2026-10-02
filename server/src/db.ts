import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { FUND_CATALOG, BENCHMARK_CATALOG } from './catalog.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

/**
 * Thin wrapper over Node's built-in SQLite.
 *
 * We use `node:sqlite` rather than better-sqlite3 so that `npm install`
 * never has to compile a native addon — that build is the step most likely
 * to fail on a constrained machine (an Android phone under Termux, a locked
 * down work laptop), and SQLite itself is identical either way.
 *
 * The wrapper adds the two better-sqlite3 conveniences the codebase relies on
 * and node:sqlite does not provide: `pragma()` and `transaction()`.
 */
/** Result of a write, with lastInsertRowid narrowed to a plain number. */
export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * A prepared statement. Rows come back as `unknown` so each call site states
 * the shape it expects, the same way the better-sqlite3 version did.
 */
export interface Statement {
  run(...params: unknown[]): RunResult;
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

type RawParams = Parameters<StatementSync['all']>;

function wrapStatement(statement: StatementSync): Statement {
  return {
    run(...params) {
      const result = statement.run(...(params as RawParams));
      return {
        changes: Number(result.changes),
        // SQLite hands back a bigint past 2^53; these tables will never get
        // there, and a plain number keeps arithmetic at call sites simple.
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    },
    get<T>(...params: unknown[]) {
      return statement.get(...(params as RawParams)) as T | undefined;
    },
    all<T>(...params: unknown[]) {
      return statement.all(...(params as RawParams)) as T[];
    },
  };
}

class Db {
  readonly raw: DatabaseSync;

  constructor(filename: string) {
    this.raw = new DatabaseSync(filename);
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  prepare(sql: string): Statement {
    return wrapStatement(this.raw.prepare(sql));
  }

  pragma(statement: string): void {
    this.raw.exec(`PRAGMA ${statement}`);
  }

  /**
   * Runs `fn` inside a transaction, matching better-sqlite3's calling
   * convention: this returns a function, so callers write `db.transaction(fn)()`.
   * Nested calls reuse the outer transaction, since SQLite has no nested BEGIN.
   */
  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    let depth = 0;
    return ((...args: Parameters<T>) => {
      if (depth > 0) return fn(...args);
      depth++;
      this.raw.exec('BEGIN');
      try {
        const result = fn(...args);
        this.raw.exec('COMMIT');
        return result;
      } catch (error) {
        this.raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    }) as T;
  }
}

export const db = new Db(config.databasePath);
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
