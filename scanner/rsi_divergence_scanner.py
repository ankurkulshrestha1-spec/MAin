# =====================================================================
# RSI Divergence Scanner — NIFTY 500 + NSE INDICES, TWO-PASS, WEEKLY
# (Google Colab friendly)
# ---------------------------------------------------------------------
# HOW TO USE:
#   Cell 1:  !pip install yfinance -q
#   Cell 2:  paste this entire file and run
#
# What it does:
#   1. Builds two universes:
#        INDICES — every equity index on NSE's "Live Market Indices" page
#                  (https://www.nseindia.com/market-data/live-market-indices,
#                  read via its JSON feed /api/allIndices). Falls back to a
#                  built-in list if NSE blocks the request.
#        STOCKS  — Nifty 500 constituents (manual-upload fallback).
#   2. Downloads daily history ONCE per instrument and resamples to WEEKLY
#      OHLC bars. Indices come from Yahoo where a ticker exists, otherwise
#      from niftyindices.com's historical-data endpoint.
#   3. Scans the same data twice:
#        PASS 1 "STRICT"  — RSI gates 30/70, recency 1 week  -> A-list
#        PASS 2 "RELAXED" — RSI gates 40/60, recency 3 weeks -> watchlist
#      Pass 2 output excludes anything already flagged in Pass 1.
#   4. Saves everything to divergence_signals_weekly.csv with Universe and
#      Tier columns.
#
# Improvements over the original stock-only version:
#   * Indices universe (above), each with its NSE category.
#   * Optional pivots on weekly High/Low instead of Close (PIVOT_PRICE).
#   * "Clean" divergence filter: price and RSI between the two pivots must
#     not cut through the line joining them, so the pivots really connect.
#   * When several pairs end on the same pivot, the strongest RSI
#     divergence wins (previously the first pair found won).
#   * "Confirmed" column: price has since broken the swing between pivots.
#   * Current close / current RSI / % price change / RSI change columns.
#   * Retry pass for failed Yahoo symbols, and correct RSI when a flat
#     series has neither gains nor losses (50, not 100).
#
# If STRICT is empty but RELAXED has signals, the scanner is healthy —
# nothing is at a true extreme. If BOTH are empty, the data download
# failed (check the failed-symbol count).
# =====================================================================

import io
import json
import re
import time
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests
import yfinance as yf

# ------------------------- CONFIG — edit me -------------------------
SCAN_INDICES = True
SCAN_STOCKS = True

RSI_PERIOD = 14
PIVOT_WINDOW = 3          # weekly bars either side of a pivot
MIN_PIVOT_GAP = 4         # min weeks between the two pivots
MAX_PIVOT_GAP = 26        # max weeks between the two pivots (~6 months)
LOOKBACK = "5y"           # daily history, resampled to weekly
BATCH_SIZE = 50
BATCH_PAUSE = 1.0

PIVOT_PRICE = "close"     # "close" = pivots on weekly close (original)
                          # "hl"    = lows on weekly Low, highs on weekly High
CLEAN_DIVERGENCE = True   # reject pairs where the in-between bars cut the
RSI_LINE_TOL = 2.0        #   pivot-to-pivot line (RSI points)
PRICE_LINE_TOL = 0.01     #   ... or (fraction of price, 0.01 = 1%)
MIN_RSI_DIFF = 1.0        # RSI must diverge by more than this many points
DROP_PARTIAL_WEEK = False # True = ignore the still-forming current week

PASSES = [
    # name       bull_max  bear_min  recency(weeks)  include_hidden
    ("STRICT",   30.0,     70.0,     1,              False),
    ("RELAXED",  40.0,     60.0,     3,              False),
]
# Tip: to add hidden/continuation signals as a third tier, append:
#   ("HIDDEN",  100.0,    0.0,      2,       True),
# Note: a pivot needs PIVOT_WINDOW bars after it to be confirmed, so the
# effective look-back for pivot 2 is recency + PIVOT_WINDOW weeks.

# Index categories (NSE's grouping on the live-indices page) to skip.
# Fixed-income / G-Sec indices have no meaningful equity RSI.
INDEX_SKIP_CATEGORIES = ("FIXED INCOME",)
INDEX_SKIP_NAMES = ()     # e.g. ("INDIA VIX",) to drop VIX
INDEX_HISTORY_YEARS = 4   # years pulled from niftyindices.com fallback
OUTPUT_CSV = "divergence_signals_weekly.csv"
# ---------------------------------------------------------------------

NIFTY500_URLS = [
    "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/csv,*/*",
    "Referer": "https://www.niftyindices.com/",
}

# Yahoo Finance tickers for NSE indices. Keys are normalised index names
# (see norm()); several aliases point at the same ticker because NSE uses
# both long and short names. Anything missing here — or anything Yahoo
# returns empty — is fetched from niftyindices.com instead.
YAHOO_INDEX_MAP = {
    "NIFTY50": "^NSEI",
    "NIFTYNEXT50": "^NSMIDCP",
    "NIFTY100": "^CNX100",
    "NIFTY200": "^CNX200",
    "NIFTY500": "^CRSLDX",
    "NIFTYMIDCAP50": "^NSEMDCP50",
    "NIFTYMIDCAP100": "NIFTY_MIDCAP_100.NS",
    "NIFTYMIDCAP150": "NIFTYMIDCAP150.NS",
    "NIFTYSMALLCAP100": "^CNXSC",
    "NIFTYSMLCAP100": "^CNXSC",
    "NIFTYSMALLCAP250": "NIFTYSMLCAP250.NS",
    "NIFTYSMLCAP250": "NIFTYSMLCAP250.NS",
    "INDIAVIX": "^INDIAVIX",
    "NIFTYBANK": "^NSEBANK",
    "NIFTYAUTO": "^CNXAUTO",
    "NIFTYFINANCIALSERVICES": "NIFTY_FIN_SERVICE.NS",
    "NIFTYFINSERVICE": "NIFTY_FIN_SERVICE.NS",
    "NIFTYFMCG": "^CNXFMCG",
    "NIFTYIT": "^CNXIT",
    "NIFTYMEDIA": "^CNXMEDIA",
    "NIFTYMETAL": "^CNXMETAL",
    "NIFTYPHARMA": "^CNXPHARMA",
    "NIFTYPSUBANK": "^CNXPSUBANK",
    "NIFTYPRIVATEBANK": "NIFTY_PVT_BANK.NS",
    "NIFTYPVTBANK": "NIFTY_PVT_BANK.NS",
    "NIFTYREALTY": "^CNXREALTY",
    "NIFTYENERGY": "^CNXENERGY",
    "NIFTYINFRASTRUCTURE": "^CNXINFRA",
    "NIFTYINFRA": "^CNXINFRA",
    "NIFTYCOMMODITIES": "^CNXCMDT",
    "NIFTYINDIACONSUMPTION": "^CNXCONSUM",
    "NIFTYCONSUMPTION": "^CNXCONSUM",
    "NIFTYMNC": "^CNXMNC",
    "NIFTYPSE": "^CNXPSE",
    "NIFTYSERVICESSECTOR": "^CNXSERVICE",
    "NIFTYSERVSECTOR": "^CNXSERVICE",
    "NIFTYCPSE": "NIFTY_CPSE.NS",
}

# Used only when NSE's live-indices feed is unreachable (common on Colab,
# whose IPs NSE often blocks). Names match niftyindices.com's spelling.
FALLBACK_INDICES = [
    ("BROAD MARKET INDICES", n) for n in [
        "NIFTY 50", "NIFTY NEXT 50", "NIFTY 100", "NIFTY 200", "NIFTY 500",
        "NIFTY TOTAL MARKET", "NIFTY MIDCAP 50", "NIFTY MIDCAP 100",
        "NIFTY MIDCAP 150", "NIFTY MIDCAP SELECT", "NIFTY SMALLCAP 50",
        "NIFTY SMALLCAP 100", "NIFTY SMALLCAP 250", "NIFTY MICROCAP 250",
        "NIFTY LARGEMIDCAP 250", "NIFTY MIDSMALLCAP 400", "INDIA VIX",
    ]
] + [
    ("SECTORAL INDICES", n) for n in [
        "NIFTY AUTO", "NIFTY BANK", "NIFTY FINANCIAL SERVICES",
        "NIFTY FINANCIAL SERVICES 25/50", "NIFTY FMCG", "NIFTY HEALTHCARE INDEX",
        "NIFTY IT", "NIFTY MEDIA", "NIFTY METAL", "NIFTY PHARMA",
        "NIFTY PRIVATE BANK", "NIFTY PSU BANK", "NIFTY REALTY",
        "NIFTY CONSUMER DURABLES", "NIFTY OIL & GAS",
    ]
] + [
    ("THEMATIC INDICES", n) for n in [
        "NIFTY COMMODITIES", "NIFTY INDIA CONSUMPTION", "NIFTY CPSE",
        "NIFTY ENERGY", "NIFTY INFRASTRUCTURE", "NIFTY MNC", "NIFTY PSE",
        "NIFTY SERVICES SECTOR", "NIFTY INDIA DEFENCE",
        "NIFTY INDIA MANUFACTURING", "NIFTY CAPITAL MARKETS",
        "NIFTY INDIA DIGITAL", "NIFTY EV & NEW AGE AUTOMOTIVE",
        "NIFTY HOUSING", "NIFTY INDIA TOURISM", "NIFTY CHEMICALS",
    ]
] + [
    ("STRATEGY INDICES", n) for n in [
        "NIFTY100 QUALITY 30", "NIFTY200 MOMENTUM 30", "NIFTY ALPHA 50",
        "NIFTY100 LOW VOLATILITY 30", "NIFTY DIVIDEND OPPORTUNITIES 50",
        "NIFTY50 VALUE 20", "NIFTY200 QUALITY 30",
    ]
]


def norm(name):
    """'NIFTY Fin Service' -> 'NIFTYFINSERVICE' for loose name matching."""
    return re.sub(r"[^A-Z0-9]", "", str(name).upper())


# ======================= UNIVERSE: NIFTY 500 =========================
def _symbols_from_csv(df):
    col = "Symbol" if "Symbol" in df.columns else df.columns[2]
    return df[col].astype(str).str.strip().tolist()


def get_nifty500_symbols():
    for url in NIFTY500_URLS:
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
            syms = _symbols_from_csv(pd.read_csv(io.StringIO(r.text)))
            if len(syms) > 400:
                print(f"Fetched {len(syms)} constituents from {url.split('/')[2]}")
                return syms
        except Exception as e:
            print(f"  [!] {url.split('/')[2]} failed: {e}")
    print("\nNSE blocked the automated download. Manual fallback:")
    print("  1. Download in your browser:")
    print("     https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv")
    print("  2. Upload it below.")
    try:
        from google.colab import files
        uploaded = files.upload()
        fname = next(iter(uploaded))
        return _symbols_from_csv(pd.read_csv(io.BytesIO(uploaded[fname])))
    except ImportError:
        raise SystemExit("Not in Colab — load the CSV manually.")


# ======================= UNIVERSE: NSE INDICES =======================
def get_nse_indices():
    """[(category, index name)] from NSE's live-market-indices feed.

    The page at /market-data/live-market-indices is rendered from
    /api/allIndices, which only answers once the session carries the
    cookies NSE sets on a normal page visit.
    """
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9",
                      "Accept": "*/*"})
    try:
        s.get("https://www.nseindia.com/market-data/live-market-indices",
              timeout=15)
        r = s.get("https://www.nseindia.com/api/allIndices", timeout=15,
                  headers={"Referer": "https://www.nseindia.com/"
                                      "market-data/live-market-indices"})
        r.raise_for_status()
        rows = r.json().get("data", [])
        out, seen = [], set()
        for row in rows:
            name = (row.get("index") or row.get("indexSymbol") or "").strip()
            cat = (row.get("key") or "OTHER").strip().upper()
            if name and norm(name) not in seen:
                seen.add(norm(name))
                out.append((cat, name))
        if len(out) > 20:
            print(f"Fetched {len(out)} indices from NSE live-market-indices")
            return out
        print(f"  [!] NSE returned only {len(out)} indices")
    except Exception as e:
        print(f"  [!] NSE live-indices feed failed: {e}")
    print(f"  Using built-in list of {len(FALLBACK_INDICES)} indices instead.")
    return list(FALLBACK_INDICES)


def fetch_niftyindices_history(name, years=INDEX_HISTORY_YEARS):
    """Daily High/Low/Close for one index from niftyindices.com.

    The site's historical-data form posts to this endpoint; it serves at
    most about a year per request, so the range is fetched in chunks.
    """
    url = ("https://www.niftyindices.com/Backpage.aspx/"
           "getHistoricaldatatabletoString")
    hdrs = {"User-Agent": UA, "Content-Type": "application/json; charset=UTF-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://www.niftyindices.com",
            "Referer": "https://www.niftyindices.com/reports/historical-data"}
    end = date.today()
    frames = []
    for _ in range(years):
        start = end - timedelta(days=364)
        cinfo = ("{'name':'%s','startDate':'%s','endDate':'%s','indexName':'%s'}"
                 % (name, start.strftime("%d-%b-%Y"), end.strftime("%d-%b-%Y"),
                    name))
        try:
            r = requests.post(url, headers=hdrs,
                              data=json.dumps({"cinfo": cinfo}), timeout=20)
            r.raise_for_status()
            chunk = parse_niftyindices_payload(r.json())
        except Exception:
            if not frames:
                raise
            break                 # keep the history we already have
        if chunk.empty:
            break                 # index didn't exist that far back
        frames.append(chunk)
        end = start - timedelta(days=1)
        time.sleep(0.3)
    df = pd.concat(frames)
    return df[~df.index.duplicated()].sort_index()


def parse_niftyindices_payload(payload):
    rows = json.loads(payload.get("d") or "[]")
    if not rows:
        return pd.DataFrame(columns=["High", "Low", "Close"])
    df = pd.DataFrame(rows)
    cols = {c.upper(): c for c in df.columns}
    date_col = next(c for k, c in cols.items() if "DATE" in k)

    def num(key):
        if key not in cols:
            return np.nan
        return pd.to_numeric(df[cols[key]].astype(str).str.replace(",", ""),
                             errors="coerce")

    out = pd.DataFrame({"High": num("HIGH"), "Low": num("LOW"),
                        "Close": num("CLOSE")})
    out.index = pd.to_datetime(df[date_col], format="mixed", dayfirst=True)
    return out


# ============================ INDICATORS =============================
def to_weekly(daily):
    """Daily High/Low/Close -> weekly (Friday-labelled) High/Low/Close."""
    daily = daily.dropna(subset=["Close"])
    w = daily.resample("W-FRI").agg({"High": "max", "Low": "min",
                                      "Close": "last"}).dropna(subset=["Close"])
    w["High"] = w["High"].fillna(w["Close"])
    w["Low"] = w["Low"].fillna(w["Close"])
    if DROP_PARTIAL_WEEK and len(w) and daily.index[-1].dayofweek < 4:
        w = w.iloc[:-1]
    return w


def rsi_wilder(close, period=14):
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rsi = 100 - 100 / (1 + avg_gain / avg_loss.replace(0, np.nan))
    # No losses: 100 if there were gains, 50 if the series was flat.
    rsi = rsi.where(avg_loss != 0, np.where(avg_gain > 0, 100.0, 50.0))
    return rsi.where(avg_loss.notna())


def find_pivots(vals, window, kind):
    n = len(vals)
    pivots = []
    for i in range(window, n - window):
        nb = vals[i - window: i + window + 1]
        if kind == "low" and vals[i] == nb.min():
            pivots.append(i)
        elif kind == "high" and vals[i] == nb.max():
            pivots.append(i)
    deduped = []
    for p in pivots:
        if deduped and p - deduped[-1] <= window and vals[p] == vals[deduped[-1]]:
            deduped[-1] = p
        else:
            deduped.append(p)
    return deduped


def line_holds(vals, i, j, kind, tol):
    """True if vals[i+1:j] stay on the correct side of the i->j line.

    For lows nothing in between may sit (meaningfully) below the line, for
    highs nothing may sit above it — otherwise i and j are not the two
    swing points a trader would actually connect.
    """
    if j - i < 2:
        return True
    k = np.arange(i + 1, j)
    line = vals[i] + (vals[j] - vals[i]) * (k - i) / (j - i)
    seg, tol = vals[i + 1:j], tol[i + 1:j]
    ok = ~np.isnan(seg)
    if kind == "low":
        return bool(np.all(seg[ok] >= line[ok] - tol[ok]))
    return bool(np.all(seg[ok] <= line[ok] + tol[ok]))


# ============================== MODEL ================================
@dataclass
class Signal:
    universe: str
    category: str
    ticker: str
    kind: str
    date1: str
    date2: str
    price1: float
    price2: float
    rsi1: float
    rsi2: float
    bars_ago: int
    confirmed: bool
    last_close: float
    last_rsi: float

    def key(self):
        return (self.universe, self.ticker, self.kind)

    def row(self, tier):
        return {"Universe": self.universe, "Tier": tier,
                "Category": self.category, "Ticker": self.ticker,
                "Signal": self.kind,
                "Pivot 1": self.date1, "Pivot 2": self.date2,
                "Price 1": round(self.price1, 2), "Price 2": round(self.price2, 2),
                "Price chg %": round((self.price2 / self.price1 - 1) * 100, 2),
                "RSI 1": round(self.rsi1, 1), "RSI 2": round(self.rsi2, 1),
                "RSI chg": round(self.rsi2 - self.rsi1, 1),
                "Weeks ago": self.bars_ago, "Confirmed": self.confirmed,
                "Last close": round(self.last_close, 2),
                "RSI now": round(self.last_rsi, 1)}


class Instrument:
    """Precomputed weekly RSI + pivots so multiple passes reuse the work."""
    def __init__(self, daily, ticker, universe, category=""):
        self.ticker, self.universe, self.category = ticker, universe, category
        w = to_weekly(daily.astype(float))
        self.n = len(w)
        self.ok = self.n >= RSI_PERIOD + 2 * PIVOT_WINDOW + MIN_PIVOT_GAP
        if not self.ok:
            return
        self.dates = w.index
        self.close = w["Close"].to_numpy()
        if PIVOT_PRICE == "hl":
            self.low_px, self.high_px = w["Low"].to_numpy(), w["High"].to_numpy()
        else:
            self.low_px = self.high_px = self.close
        self.rsi = rsi_wilder(w["Close"], RSI_PERIOD).to_numpy()
        self.lows = find_pivots(self.low_px, PIVOT_WINDOW, "low")
        self.highs = find_pivots(self.high_px, PIVOT_WINDOW, "high")


def scan(inst, bull_max, bear_min, recency, include_hidden):
    if not inst.ok:
        return []
    rsi, n = inst.rsi, inst.n
    rsi_tol = np.full(n, RSI_LINE_TOL)
    signals = []

    def check(pivots, px, side, price_cmp, rsi_cmp, rsi_gate, label):
        bullish = "BULLISH" in label
        price_tol = np.abs(px) * PRICE_LINE_TOL
        for b in range(len(pivots) - 1, 0, -1):
            j = pivots[b]
            bars_ago = n - 1 - j
            if bars_ago > recency + PIVOT_WINDOW:
                break                     # pivots are sorted; older ones fail too
            for a in range(b - 1, -1, -1):
                i = pivots[a]
                gap = j - i
                if gap < MIN_PIVOT_GAP:
                    continue
                if gap > MAX_PIVOT_GAP:
                    break
                p1, p2, r1, r2 = px[i], px[j], rsi[i], rsi[j]
                if np.isnan(r1) or np.isnan(r2):
                    continue
                if not (price_cmp(p1, p2) and rsi_cmp(r1, r2) and rsi_gate(r1)):
                    continue
                if CLEAN_DIVERGENCE and not (
                        line_holds(px, i, j, side, price_tol)
                        and line_holds(rsi, i, j, side, rsi_tol)):
                    continue
                # Confirmation: price has since closed beyond the swing
                # between the pivots (above its high for bullish setups,
                # below its low for bearish ones).
                swing = inst.close[i:j + 1]
                after = inst.close[j + 1:]
                confirmed = bool(len(after)) and (
                    after.max() > swing.max() if bullish
                    else after.min() < swing.min())
                signals.append(Signal(
                    inst.universe, inst.category, inst.ticker, label,
                    str(inst.dates[i].date()), str(inst.dates[j].date()),
                    float(p1), float(p2), float(r1), float(r2), bars_ago,
                    confirmed, float(inst.close[-1]), float(rsi[-1])))

    up = lambda r1, r2: r2 > r1 + MIN_RSI_DIFF
    down = lambda r1, r2: r2 < r1 - MIN_RSI_DIFF
    check(inst.lows, inst.low_px, "low", lambda p1, p2: p2 < p1, up,
          lambda r1: r1 < bull_max, "REGULAR BULLISH")
    check(inst.highs, inst.high_px, "high", lambda p1, p2: p2 > p1, down,
          lambda r1: r1 > bear_min, "REGULAR BEARISH")
    if include_hidden:
        check(inst.lows, inst.low_px, "low", lambda p1, p2: p2 > p1, down,
              lambda r1: True, "HIDDEN BULLISH")
        check(inst.highs, inst.high_px, "high", lambda p1, p2: p2 < p1, up,
              lambda r1: True, "HIDDEN BEARISH")

    # One signal per kind: most recent pivot 2, then the biggest RSI gap.
    best = {}
    for s in signals:
        rank = (s.bars_ago, -abs(s.rsi2 - s.rsi1))
        if s.kind not in best or rank < best[s.kind][0]:
            best[s.kind] = (rank, s)
    return [s for _, s in best.values()]


# ============================ DOWNLOADS ==============================
def _extract(data, sym):
    if data is None or data.empty:
        return None
    if isinstance(data.columns, pd.MultiIndex):
        if sym not in data.columns.get_level_values(0):
            return None
        df = data[sym]
    else:
        df = data
    if "Close" not in df.columns:
        return None
    df = df.reindex(columns=["High", "Low", "Close"]).dropna(subset=["Close"])
    return df if len(df) else None


def yahoo_download(symbols, label):
    """{symbol: daily DataFrame}; failed symbols get one retry pass."""
    got = {}
    pending = list(symbols)
    for attempt in (1, 2):
        if not pending:
            break
        if attempt == 2:
            print(f"  retrying {len(pending)} failed {label} symbols...")
            time.sleep(BATCH_PAUSE * 5)
        missed = []
        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
            try:
                data = yf.download(batch, period=LOOKBACK, interval="1d",
                                   auto_adjust=True, progress=False,
                                   group_by="ticker", threads=True)
            except Exception as e:
                print(f"  [!] {label} batch {start//BATCH_SIZE + 1} failed: {e}")
                missed.extend(batch)
                continue
            for sym in batch:
                df = _extract(data, sym)
                if df is None:
                    missed.append(sym)
                else:
                    got[sym] = df
            if attempt == 1:
                print(f"  ...{min(start + BATCH_SIZE, len(pending))}"
                      f"/{len(pending)} {label} downloaded")
            time.sleep(BATCH_PAUSE)
        pending = missed
    return got, pending


def load_indices():
    indices = [(c, n) for c, n in get_nse_indices()
               if not any(s in c for s in INDEX_SKIP_CATEGORIES)
               and norm(n) not in {norm(x) for x in INDEX_SKIP_NAMES}]
    by_ticker = {}
    for cat, name in indices:
        t = YAHOO_INDEX_MAP.get(norm(name))
        if t:
            by_ticker.setdefault(t, (cat, name))

    print(f"\nDownloading {len(indices)} index histories "
          f"({len(by_ticker)} via Yahoo, rest via niftyindices.com)...")
    got, _ = yahoo_download(list(by_ticker), "index")
    insts, failed, done = [], [], set()
    for t, df in got.items():
        cat, name = by_ticker[t]
        inst = Instrument(df, name, "INDEX", cat)
        if inst.ok:
            insts.append(inst)
            done.add(norm(name))

    rest = [(c, n) for c, n in indices if norm(n) not in done
            and norm(n) != "INDIAVIX"]   # VIX is Yahoo-only
    for k, (cat, name) in enumerate(rest, 1):
        try:
            inst = Instrument(fetch_niftyindices_history(name), name, "INDEX", cat)
            if inst.ok:
                insts.append(inst)
            else:
                failed.append(name)
        except Exception as e:
            failed.append(name)
            if len(failed) <= 3:
                print(f"  [!] {name}: {e}")
        if k % 10 == 0 or k == len(rest):
            print(f"  ...{k}/{len(rest)} niftyindices histories")
    print(f"Usable index histories: {len(insts)} | failed/insufficient: "
          f"{len(failed)}")
    if failed:
        print("  failed: " + ", ".join(failed[:15])
              + (" ..." if len(failed) > 15 else ""))
    return insts, len(indices)


def load_stocks():
    symbols = get_nifty500_symbols()
    yahoo_syms = [s + ".NS" for s in symbols]
    print(f"\nDownloading {len(yahoo_syms)} stock histories in batches "
          f"({LOOKBACK} daily -> weekly)...\n")
    got, failed = yahoo_download(yahoo_syms, "stock")
    insts = []
    for sym, df in got.items():
        inst = Instrument(df, sym.replace(".NS", ""), "STOCK")
        if inst.ok:
            insts.append(inst)
        else:
            failed.append(sym)
    print(f"\nUsable stock histories: {len(insts)} | failed/insufficient: "
          f"{len(failed)}")
    if len(insts) < len(yahoo_syms) * 0.5:
        print("[!] WARNING: more than half the downloads failed — Yahoo is "
              "likely rate-limiting this session. Results below are NOT "
              "trustworthy. Wait a few minutes and re-run.")
    return insts, len(yahoo_syms)


# ============================== REPORT ===============================
def run_passes(insts, universe):
    rows, seen = [], set()
    for name, bull_max, bear_min, recency, hidden in PASSES:
        tier = [s for inst in insts
                for s in scan(inst, bull_max, bear_min, recency, hidden)
                if s.key() not in seen]       # don't repeat earlier-tier hits
        for s in tier:
            seen.add(s.key())
            rows.append(s.row(name))

        bulls = sum("BULLISH" in s.kind for s in tier)
        print(f"\n{'='*78}")
        print(f"{universe} | PASS: {name}  (RSI gates <{bull_max:.0f}/"
              f">{bear_min:.0f}, recency <= {recency} weeks)  ->  "
              f"{len(tier)} signals ({bulls} bullish, {len(tier) - bulls} bearish)")
        if not tier:
            print("  (no signals at this tier)")
        width = max([len(s.ticker) for s in tier] + [12])
        for s in sorted(tier, key=lambda s: (s.kind, s.bars_ago)):
            print(f"  {s.ticker:<{width}} {s.kind:<16} "
                  f"P: {s.price1:>10.2f} -> {s.price2:>10.2f}   "
                  f"RSI: {s.rsi1:>5.1f} -> {s.rsi2:>5.1f}   "
                  f"{s.date1} / {s.date2} ({s.bars_ago}w ago)"
                  f"{'  CONFIRMED' if s.confirmed else ''}")
    return rows


def main():
    all_rows = []
    coverage = {}
    if SCAN_INDICES:
        insts, total = load_indices()
        coverage["INDEX"] = (len(insts), total)
        all_rows += run_passes(insts, "INDICES")
    if SCAN_STOCKS:
        insts, total = load_stocks()
        coverage["STOCK"] = (len(insts), total)
        all_rows += run_passes(insts, "NIFTY 500")

    print(f"\n{'='*78}")
    if all_rows:
        results = pd.DataFrame(all_rows)
        results.to_csv(OUTPUT_CSV, index=False)
        print(f"Total: {len(results)} signals "
              f"({', '.join(f'{u}: {c}' for u, c in results['Universe'].value_counts().items())})."
              f" Saved to {OUTPUT_CSV} (Files sidebar).")
        print("\nHow to read: STRICT = at genuine extremes, highest conviction. "
              "RELAXED = developing setups worth watching, not acting on yet. "
              "Confirmed = price has already broken the swing between pivots.")
        try:
            from IPython.display import display
            display(results)
        except ImportError:
            pass
    else:
        healthy = all(ok >= total * 0.8 for ok, total in coverage.values())
        if healthy:
            print("Zero signals in every tier with healthy data — genuinely "
                  "quiet period. The scanner is fine; nothing is diverging.")
        else:
            print("Zero signals AND poor data coverage — fix the download first.")

    print("\nReminder: divergence is a warning, not a trigger. "
          "Confirm with price structure before acting.")


if __name__ == "__main__":
    main()
