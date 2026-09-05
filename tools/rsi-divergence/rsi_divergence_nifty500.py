# =====================================================================
# RSI Divergence Scanner — NIFTY 500, TWO-PASS, WEEKLY (Google Colab)
# ---------------------------------------------------------------------
# HOW TO USE:
#   Cell 1:  !pip install yfinance -q
#   Cell 2:  paste this entire file and run
#
# What it does:
#   1. Downloads Nifty 500 constituents from NSE (manual-upload fallback)
#   2. Batch-downloads all price histories ONCE, resampled to WEEKLY bars
#   3. Scans the same data twice:
#        PASS 1 "STRICT"  — RSI gates 30/70, recency 1 week  -> A-list
#        PASS 2 "RELAXED" — RSI gates 40/60, recency 3 weeks -> watchlist
#      Pass 2 output excludes anything already flagged in Pass 1.
#   4. Saves both to divergence_signals_weekly.csv with a Tier column
#
# If STRICT is empty but RELAXED has signals, the scanner is healthy —
# nothing is at a true extreme. If BOTH are empty, the data download
# failed (check the failed-symbol count).
# =====================================================================

import io
import time
import numpy as np
import pandas as pd
import yfinance as yf
import requests
from dataclasses import dataclass

# ------------------------- CONFIG — edit me -------------------------
RSI_PERIOD = 14
PIVOT_WINDOW = 3          # weekly bars either side of a pivot
MIN_PIVOT_GAP = 4         # min weeks between the two pivots
MAX_PIVOT_GAP = 26        # max weeks between the two pivots (~6 months)
LOOKBACK = "5y"           # daily history, resampled to weekly
BATCH_SIZE = 50
BATCH_PAUSE = 1.0

PASSES = [
    # name       bull_max  bear_min  recency(weeks)  include_hidden
    ("STRICT",   30.0,     70.0,     1,              False),
    ("RELAXED",  40.0,     60.0,     3,              False),
]
# Tip: to add hidden/continuation signals as a third tier, append:
#   ("HIDDEN",  100.0,    0.0,      2,       True),
# ---------------------------------------------------------------------

NIFTY500_URLS = [
    "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv",
    "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
]
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0 Safari/537.36"),
    "Accept": "text/csv,*/*",
    "Referer": "https://www.niftyindices.com/",
}


def get_nifty500_symbols():
    for url in NIFTY500_URLS:
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            col = "Symbol" if "Symbol" in df.columns else df.columns[2]
            syms = df[col].astype(str).str.strip().tolist()
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
        df = pd.read_csv(io.BytesIO(uploaded[fname]))
        col = "Symbol" if "Symbol" in df.columns else df.columns[2]
        return df[col].astype(str).str.strip().tolist()
    except ImportError:
        raise SystemExit("Not in Colab — load the CSV manually.")


def to_weekly(close):
    """Daily close series -> weekly (Friday) close series."""
    return close.dropna().resample("W-FRI").last().dropna()


def _wilder_smooth(series, period):
    """Wilder's smoothing: seed with the mean of the first `period` moves, then
    recurse. A plain ewm(alpha=1/period) seeds off a single bar instead and needs
    a few hundred bars to converge onto the same track — close enough deep into a
    5y history, but it would not match what a charting platform prints."""
    vals = series.to_numpy(dtype=float)
    out = np.full(len(vals), np.nan)
    if len(vals) <= period:
        return pd.Series(out, index=series.index)
    avg = vals[1:period + 1].mean()   # vals[0] is the first diff -> NaN
    out[period] = avg
    for i in range(period + 1, len(vals)):
        avg = (avg * (period - 1) + vals[i]) / period
        out[i] = avg
    return pd.Series(out, index=series.index)


def rsi_wilder(close, period=14):
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = _wilder_smooth(gain, period)
    avg_loss = _wilder_smooth(loss, period)
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(100.0).where(avg_loss.notna(), np.nan)


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


@dataclass
class Signal:
    ticker: str
    kind: str
    date1: str
    date2: str
    price1: float
    price2: float
    rsi1: float
    rsi2: float
    bars_ago: int

    def key(self):
        return (self.ticker, self.kind)

    def row(self, tier):
        return {"Tier": tier, "Ticker": self.ticker, "Signal": self.kind,
                "Pivot 1": self.date1, "Pivot 2": self.date2,
                "Price 1": round(self.price1, 2), "Price 2": round(self.price2, 2),
                "RSI 1": round(self.rsi1, 1), "RSI 2": round(self.rsi2, 1),
                "Weeks ago": self.bars_ago}


class StockSeries:
    """Precomputed weekly RSI + pivots so multiple passes reuse the same work."""
    def __init__(self, close, ticker):
        self.ticker = ticker
        self.close = to_weekly(close.dropna().astype(float))
        self.n = len(self.close)
        self.ok = self.n >= RSI_PERIOD + 2 * PIVOT_WINDOW + MIN_PIVOT_GAP
        if not self.ok:
            return
        self.rsi = rsi_wilder(self.close, RSI_PERIOD)
        vals = self.close.to_numpy()
        self.lows = find_pivots(vals, PIVOT_WINDOW, "low")
        self.highs = find_pivots(vals, PIVOT_WINDOW, "high")


def scan(stock, bull_max, bear_min, recency, include_hidden):
    if not stock.ok:
        return []
    close, rsi, n = stock.close, stock.rsi, stock.n
    signals = []

    def check(pivots, price_cmp, rsi_cmp, rsi_gate, label):
        for a in range(len(pivots) - 1):
            for b in range(a + 1, len(pivots)):
                i, j = pivots[a], pivots[b]
                gap = j - i
                if gap < MIN_PIVOT_GAP or gap > MAX_PIVOT_GAP:
                    continue
                bars_ago = n - 1 - j
                if bars_ago > recency + PIVOT_WINDOW:
                    continue
                p1, p2 = close.iloc[i], close.iloc[j]
                r1, r2 = rsi.iloc[i], rsi.iloc[j]
                if np.isnan(r1) or np.isnan(r2):
                    continue
                if price_cmp(p1, p2) and rsi_cmp(r1, r2) and rsi_gate(r1):
                    signals.append(Signal(
                        stock.ticker, label,
                        str(close.index[i].date()), str(close.index[j].date()),
                        float(p1), float(p2), float(r1), float(r2), bars_ago))

    check(stock.lows,  lambda p1, p2: p2 < p1, lambda r1, r2: r2 > r1 + 1.0,
          lambda r1: r1 < bull_max, "REGULAR BULLISH")
    check(stock.highs, lambda p1, p2: p2 > p1, lambda r1, r2: r2 < r1 - 1.0,
          lambda r1: r1 > bear_min, "REGULAR BEARISH")
    if include_hidden:
        check(stock.lows,  lambda p1, p2: p2 > p1, lambda r1, r2: r2 < r1 - 1.0,
              lambda r1: True, "HIDDEN BULLISH")
        check(stock.highs, lambda p1, p2: p2 < p1, lambda r1, r2: r2 > r1 + 1.0,
              lambda r1: True, "HIDDEN BEARISH")

    best = {}
    for s in signals:
        if s.kind not in best or s.bars_ago < best[s.kind].bars_ago:
            best[s.kind] = s
    return list(best.values())


def download_all(yahoo_syms):
    """Batch-download daily closes and build a StockSeries per usable symbol."""
    stocks, failed = [], []
    for start in range(0, len(yahoo_syms), BATCH_SIZE):
        batch = yahoo_syms[start:start + BATCH_SIZE]
        try:
            data = yf.download(batch, period=LOOKBACK, interval="1d",
                               auto_adjust=True, progress=False,
                               group_by="ticker", threads=True)
        except Exception as e:
            print(f"  [!] batch {start//BATCH_SIZE + 1} failed: {e}")
            failed.extend(batch)
            continue
        for sym in batch:
            try:
                close = (data[sym]["Close"] if isinstance(data.columns, pd.MultiIndex)
                         else data["Close"])
                st = StockSeries(close, sym.replace(".NS", ""))
                if st.ok:
                    stocks.append(st)
                else:
                    failed.append(sym)
            except (KeyError, TypeError):
                failed.append(sym)
        done = min(start + BATCH_SIZE, len(yahoo_syms))
        print(f"  ...{done}/{len(yahoo_syms)} downloaded")
        time.sleep(BATCH_PAUSE)
    return stocks, failed


def run_passes(stocks):
    """Run every configured pass over the shared data; returns CSV-ready rows."""
    all_rows = []
    seen = set()

    for name, bull_max, bear_min, recency, hidden in PASSES:
        tier_signals = []
        for st in stocks:
            for s in scan(st, bull_max, bear_min, recency, hidden):
                if s.key() not in seen:      # don't repeat strict hits in relaxed
                    tier_signals.append(s)
        for s in tier_signals:
            seen.add(s.key())
            all_rows.append(s.row(name))

        bulls = sum(1 for s in tier_signals if "BULLISH" in s.kind)
        bears = sum(1 for s in tier_signals if "BEARISH" in s.kind)
        print(f"\n{'='*70}")
        print(f"PASS: {name}  (RSI gates <{bull_max:.0f}/>{bear_min:.0f}, "
              f"recency <= {recency} weeks)  ->  "
              f"{len(tier_signals)} signals ({bulls} bullish, {bears} bearish)")
        if not tier_signals:
            print("  (no signals at this tier)")
        else:
            for s in sorted(tier_signals, key=lambda s: (s.kind, s.bars_ago)):
                print(f"  {s.ticker:<12} {s.kind:<16} "
                      f"P: {s.price1:>9.2f} -> {s.price2:>9.2f}   "
                      f"RSI: {s.rsi1:>5.1f} -> {s.rsi2:>5.1f}   "
                      f"{s.date1} / {s.date2} ({s.bars_ago}w ago)")
    return all_rows


def main():
    # ---------------------- DOWNLOAD (once) ----------------------
    symbols = get_nifty500_symbols()
    yahoo_syms = [s + ".NS" for s in symbols]

    print(f"\nDownloading {len(yahoo_syms)} price histories in batches "
          f"({LOOKBACK} daily -> weekly)...\n")
    stocks, failed = download_all(yahoo_syms)

    print(f"\nUsable histories: {len(stocks)} | failed/insufficient: {len(failed)}")
    if len(stocks) < len(yahoo_syms) * 0.5:
        print("[!] WARNING: more than half the downloads failed — Yahoo is likely "
              "rate-limiting this session. Results below are NOT trustworthy. "
              "Wait a few minutes and re-run.")

    # ---------------------- SCAN (both passes) ----------------------
    all_rows = run_passes(stocks)

    # ---------------------- OUTPUT ----------------------
    print(f"\n{'='*70}")
    if all_rows:
        results = pd.DataFrame(all_rows)
        results.to_csv("divergence_signals_weekly.csv", index=False)
        print(f"Total: {len(results)} signals across both tiers. "
              "Saved to divergence_signals_weekly.csv (Files sidebar).")
        print("\nHow to read: STRICT = at genuine extremes, highest conviction. "
              "RELAXED = developing setups worth watching, not acting on yet.")
        try:
            from IPython.display import display
            display(results)
        except ImportError:
            pass
    else:
        if len(stocks) > 400:
            print("Zero signals in BOTH tiers with healthy data — genuinely quiet "
                  "period. The scanner is fine; nothing is diverging.")
        else:
            print("Zero signals AND poor data coverage — fix the download first.")

    print("\nReminder: divergence is a warning, not a trigger. "
          "Confirm with price structure before acting.")


if __name__ == "__main__":
    main()
