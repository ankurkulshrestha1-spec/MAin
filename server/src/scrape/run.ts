/**
 * CLI: `npm run scrape` fetches and ingests today's NAVs.
 *
 * Flags:
 *   --dump             save the fetched HTML to data/last-scrape.html
 *   --file <path>      parse a saved HTML file instead of fetching (offline)
 *   --dry              parse and print rows without writing to the database
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ensureCatalog } from '../db.js';
import { fetchPage, scrapeNavs } from './pnbmetlife.js';
import { parseFundTable, parsePageNavDate } from './parse.js';

const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
const dump = args.includes('--dump');
const dry = args.includes('--dry');

ensureCatalog();

const html =
  fileArg !== -1 && args[fileArg + 1]
    ? fs.readFileSync(args[fileArg + 1]!, 'utf8')
    : await fetchPage(config.allFundsUrl);

if (dump) {
  const out = path.join(path.dirname(config.databasePath), 'last-scrape.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Saved page HTML to ${out}`);
}

if (dry) {
  const rows = parseFundTable(html);
  console.log(`Page NAV date: ${parsePageNavDate(html) ?? '(none found)'}`);
  console.log(`Parsed ${rows.length} row(s):`);
  console.table(rows);
} else {
  const result = await scrapeNavs(html);
  console.log(`Status: ${result.status}`);
  console.log(`Rows seen: ${result.fundsSeen}, NAV points written: ${result.fundsUpdated}`);
  if (result.unmatched.length) {
    console.log('Needs attention:');
    for (const item of result.unmatched) console.log(`  - ${item}`);
  }
  if (result.message) console.log(result.message);
}
