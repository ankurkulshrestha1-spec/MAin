# PNB MetLife Fund Tracker

A mobile app for tracking the performance of PNB MetLife India ULIP funds — the
ones you manage and the rest of the lineup they compete against.

Two parts:

| Path      | What it is                                                              |
|-----------|-------------------------------------------------------------------------|
| `server/` | Node + TypeScript API. Ingests NAVs, stores history in SQLite, computes returns/risk/rankings. |
| `mobile/` | Expo (React Native) app. Runs on iOS and Android from one codebase.      |

The app is a client of the server, so the server has to be running and reachable
from the phone.

## What it does

**My Funds** — only the funds you've flagged as yours, with a book-level roll-up:
AUM-weighted return over the selected window, total AUM, and how many of your
funds sit in the top 3 of their category.

**All Funds** — the whole lineup, ranked within category over the window you
pick, searchable by name or SFIN, filterable by asset class.

**Fund detail** — NAV chart with the benchmark overlaid (rescaled onto the fund's
NAV so both fit one axis), the full returns ladder from 1 day to since-inception,
and risk metrics (annualised volatility, max drawdown, Sharpe) measured over the
window on screen.

**Compare** — up to six funds on one chart, each rebased to 100 at the start of
the window so a ₹10 index fund and a ₹70 equity fund are directly comparable.

**Settings** — server address, data status, and a manual scrape trigger.

## Running it

Needs **Node 22.5 or newer** — the server uses Node's built-in SQLite, so
nothing has to compile during `npm install`. Check with `node -v`.

### Server

```bash
cd server
npm install
cp .env.example .env
npm run seed     # generates development NAV history so the app has something to show
npm run dev      # http://localhost:4000
```

`npm run seed` writes **synthetic** NAVs (source `seed`) so you can use the app
before real data lands. They are not real NAVs. Clear them once you have live
data:

```sql
DELETE FROM nav_history WHERE source = 'seed';
```

### Mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. Then open **Settings** in the app and set the
server address to your computer's LAN IP — `http://192.168.x.x:4000`.
`localhost` only resolves on the iOS simulator and on web, not on a real phone.

### Running it all on an Android phone, with no computer

Termux gives you a Linux shell on Android, which is enough to run both halves.
Because the server and the app are then on the same device, `localhost` works
and you can skip the LAN IP step entirely.

Install [Termux from F-Droid](https://f-droid.org/packages/com.termux/) — not the
Play Store build, which is no longer maintained — then:

```bash
pkg update && pkg upgrade
pkg install nodejs git
git clone https://github.com/ankurkulshrestha1-spec/MAin.git
cd MAin && git checkout claude/pnb-metlife-fund-tracker-71j43x
cd server && npm install && cp .env.example .env && npm run seed && npm run dev
```

Then open a second Termux session (swipe in from the left → New session):

```bash
cd MAin/mobile && npm install && npx expo start
```

Install Expo Go from the Play Store and open the project. Leave the app's server
address at its `http://localhost:4000` default.

Note that the daily scrape only runs while Termux is running, so NAVs update when
you open it rather than on a schedule. Host the server somewhere always-on if you
want unattended daily updates.

## Where NAVs come from

PNB MetLife publishes ULIP NAVs on their fund performance page but offers no
public API, so the server supports three ingestion paths, in order of preference:

**1. Scrape (automatic).** A daily cron job — `SCRAPE_CRON`, default 21:30 IST on
weekdays, after NAVs are published — fetches the fund performance page and reads
the NAV table.

The parser locates columns by their *header text* rather than by CSS selector or
position, so it survives PNB MetLife reordering columns or restyling the page.
It matches scraped rows to funds by SFIN first, falling back to a normalised name
match, and inserts funds it has never seen rather than dropping them.

To check it against the live page:

```bash
cd server
npm run scrape -- --dry            # parse and print, write nothing
npm run scrape -- --dump           # also save the HTML to data/last-scrape.html
npm run scrape -- --file page.html # parse a saved file offline
```

If the page layout changes enough to break parsing, `--dry` shows you exactly
what the parser sees.

**2. CSV import.** Point it at any export with fund/date/nav columns (matched by
header name, order-independent):

```bash
curl -X POST http://localhost:4000/api/import/csv \
  -H "Content-Type: text/csv" --data-binary @navs.csv
```

Rows naming an unknown fund are reported as errors rather than silently creating
funds — a typo in an internal export shouldn't add a phantom fund.

**3. Manual entry.**

```bash
curl -X POST http://localhost:4000/api/funds/virtue-ii/nav \
  -H "Content-Type: application/json" \
  -d '{"entries":[{"date":"2026-07-02","nav":70.46}]}'
```

## The fund catalog

`server/src/catalog.ts` seeds 25 PNB MetLife ULIP funds. SFIN codes confirmed
against public sources are marked `sfinVerified: true`; the rest are set to
`null` and flagged in the UI as "SFIN unconfirmed" until a scrape fills them in.

Verified SFINs include Virtue II (`ULIF01215/12/09VIRTUE2FND117`), the Series I
and II Preserver/Protector/Balancer/Accelerator/Multiplier funds, and the Nifty
500 Momentum 50 and Enhanced Value index funds.

**Worth checking before you rely on it:** this catalog was assembled from public
sources, not from PNB MetLife's own factsheets, and the network this was built on
could not reach pnbmetlife.com. Confirm the fund list, categories and benchmarks
against the official page on your first scrape — `npm run scrape -- --dry` prints
what the live page actually contains.

## API

| Method | Path                      | Purpose                                       |
|--------|---------------------------|-----------------------------------------------|
| GET    | `/api/funds`              | All funds with returns and category rank. `?managed=true`, `?category=`, `?rankWindow=` |
| GET    | `/api/funds/:id`          | One fund with NAV series, risk, benchmark. `?period=1m…max` |
| PATCH  | `/api/funds/:id`          | Set `isManaged`, `category`, `benchmark`, `aumCr` |
| POST   | `/api/funds/:id/nav`      | Manual NAV entry                              |
| DELETE | `/api/funds/:id/nav/:date`| Remove one NAV point                          |
| GET    | `/api/compare?ids=a,b,c`  | Up to 6 funds, rebased to 100                 |
| GET    | `/api/rankings`           | Category league tables                        |
| POST   | `/api/import/csv`         | Bulk NAV import                               |
| POST   | `/api/scrape`             | Run the scrape now                            |
| GET    | `/api/scrape/runs`        | Last 20 scrape runs                           |
| GET    | `/api/health`             | Fund/NAV counts and ingestion sources         |

Funds are addressable by numeric id or slug (`virtue-ii`).

## How returns are calculated

Windows of a year or less are reported as absolute change; anything longer is
annualised (CAGR), matching how ULIP factsheets and IRDAI disclosures quote them.

Period boundaries use an as-of lookup — the most recent NAV on or before the
target date — because ULIP NAVs only publish on business days and an exact-date
match would return nothing for any boundary landing on a weekend or holiday.

A window with insufficient history returns `null` and renders as a dash. Returns
are never extrapolated from a shorter period, and a fund too young to have a
figure is left unranked rather than ranked last.

Risk metrics are computed over the window currently on screen: volatility is the
annualised standard deviation of daily log returns (252 trading days), and Sharpe
uses the `RISK_FREE_RATE` configured on the server.

## Configuration

`server/.env` — see `.env.example`:

| Variable                | Default                          | Notes                              |
|-------------------------|----------------------------------|------------------------------------|
| `PORT`                  | `4000`                           |                                    |
| `DATABASE_PATH`         | `./data/funds.db`                |                                    |
| `PNBMET_ALL_FUNDS_URL`  | PNB MetLife all-funds page       | Override if the page moves         |
| `SCRAPE_CRON`           | `30 21 * * 1-5`                  | Weekdays 21:30                     |
| `SCRAPE_TIMEZONE`       | `Asia/Kolkata`                   |                                    |
| `SCRAPE_ON_BOOT`        | `false`                          |                                    |
| `RISK_FREE_RATE`        | `6.5`                            | Annual %, for Sharpe               |

## Tests

```bash
cd server && npm test        # 18 tests: return maths, risk, ranking, parsers, CSV import
cd server && npm run typecheck
cd mobile && npm run typecheck
```

Tests run against a separate database (`data/test.db`) so they never touch your
real NAV history.

## Notes and limitations

- The server has no authentication. It's built as a single-user tool on a private
  network — don't expose it to the internet as-is.
- Scraping depends on a third party's page structure. The header-driven parser is
  resilient to restyling but not to the table being replaced by a JavaScript-rendered
  widget; if that happens, CSV import is the fallback.
- AUM is only populated when the scraped page exposes it, or when set via PATCH.
