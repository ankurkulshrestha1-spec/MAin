import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFundTable, parseIndianDate, parseNumber, parsePageNavDate } from '../src/scrape/parse.js';
import { importNavCsv } from '../src/csv.js';
import { db, ensureCatalog } from '../src/db.js';

test('parseNumber strips currency, commas and Cr suffixes', () => {
  assert.equal(parseNumber('₹ 1,234.56'), 1234.56);
  assert.equal(parseNumber('3,206.00 Cr'), 3206);
  assert.equal(parseNumber('70.46'), 70.46);
  assert.equal(parseNumber('-'), null);
  assert.equal(parseNumber(''), null);
});

test('parseIndianDate handles the formats these pages use', () => {
  assert.equal(parseIndianDate('02/07/2026'), '2026-07-02');
  assert.equal(parseIndianDate('02 Jul 2026'), '2026-07-02');
  assert.equal(parseIndianDate('15-Dec-2009'), '2009-12-15');
  assert.equal(parseIndianDate('2026-07-02'), '2026-07-02');
  assert.equal(parseIndianDate('not a date'), null);
});

test('parseFundTable maps columns by header regardless of their order', () => {
  const html = `
    <html><body>
      <table>
        <tr><th>Nav Date</th><th>Fund Name</th><th>AUM (Cr)</th><th>NAV (₹)</th></tr>
        <tr><td>02 Jul 2026</td><td>PNB MetLife Virtue II (ULIF01215/12/09VIRTUE2FND117)</td><td>3,206.00</td><td>70.46</td></tr>
        <tr><td>02 Jul 2026</td><td>PNB MetLife Protector Fund II</td><td>412.10</td><td>28.11</td></tr>
      </table>
    </body></html>`;
  const rows = parseFundTable(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.name, 'PNB MetLife Virtue II');
  assert.equal(rows[0]!.sfin, 'ULIF01215/12/09VIRTUE2FND117');
  assert.equal(rows[0]!.nav, 70.46);
  assert.equal(rows[0]!.navDate, '2026-07-02');
  assert.equal(rows[0]!.aumCr, 3206);
  assert.equal(rows[1]!.sfin, null);
});

test('parseFundTable ignores decorative tables and picks the NAV table', () => {
  const html = `
    <html><body>
      <table><tr><th>Menu</th></tr><tr><td>Home</td></tr></table>
      <table>
        <tr><td colspan="2">Fund Performance</td></tr>
        <tr><th>Fund</th><th>NAV</th></tr>
        <tr><td>PNB MetLife Balancer Fund II</td><td>45.10</td></tr>
      </table>
    </body></html>`;
  const rows = parseFundTable(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.nav, 45.1);
});

test('parseFundTable returns nothing when no NAV table exists', () => {
  assert.deepEqual(parseFundTable('<html><body><p>Down for maintenance</p></body></html>'), []);
});

test('parsePageNavDate reads a page-level "as on" date', () => {
  assert.equal(
    parsePageNavDate('<html><body><p>NAV as on 02 Jul 2026</p></body></html>'),
    '2026-07-02',
  );
});

test('importNavCsv matches funds by name or SFIN and reports bad rows', () => {
  ensureCatalog();
  db.prepare(`DELETE FROM nav_history WHERE source = 'csv'`).run();

  const csv = [
    'Fund Name,Date,NAV',
    'PNB MetLife Virtue II,02/07/2026,70.46',
    'Virtue II,03/07/2026,70.91',
    'Nonexistent Fund,03/07/2026,10.00',
    'PNB MetLife Virtue II,not-a-date,70.91',
  ].join('\n');

  const result = importNavCsv(csv);
  assert.equal(result.rowsRead, 4);
  assert.equal(result.navPointsWritten, 2);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0]!, /Nonexistent Fund/);
  assert.match(result.errors[1]!, /unreadable date/);
});

test('importNavCsv rejects a file missing required columns', () => {
  const result = importNavCsv('Something,Else\n1,2');
  assert.equal(result.navPointsWritten, 0);
  assert.match(result.errors[0]!, /Could not find required columns/);
});
