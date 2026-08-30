import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveFromServerRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(serverRoot, p);
}

export const config = {
  serverRoot,
  port: Number(process.env.PORT ?? 4000),
  databasePath: resolveFromServerRoot(process.env.DATABASE_PATH ?? './data/funds.db'),
  allFundsUrl:
    process.env.PNBMET_ALL_FUNDS_URL ??
    'https://www.pnbmetlife.com/investments/funds-performance/all-funds.html',
  navUrl:
    process.env.PNBMET_NAV_URL ??
    'https://www.pnbmetlife.com/investments/track-fund-value.html',
  scrapeCron: process.env.SCRAPE_CRON ?? '30 21 * * 1-5',
  scrapeTimezone: process.env.SCRAPE_TIMEZONE ?? 'Asia/Kolkata',
  scrapeOnBoot: process.env.SCRAPE_ON_BOOT === 'true',
  riskFreeRate: Number(process.env.RISK_FREE_RATE ?? 6.5),
};
