"""Offline checks for the divergence maths — no network, no yfinance calls.

Run:  python3 tools/rsi-divergence/test_rsi_divergence.py
"""

import contextlib
import io
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rsi_divergence_nifty500 as scanner


def weekly(values, start="2024-01-05"):
    """Wrap a list of closes in a Friday-dated series, the shape scan() expects."""
    idx = pd.date_range(start=start, periods=len(values), freq="W-FRI")
    return pd.Series(np.asarray(values, dtype=float), index=idx)


def reference_rsi(values, period=14):
    """Textbook Wilder RSI, written the slow way, as an independent check."""
    gains, losses = [], []
    for prev, cur in zip(values, values[1:]):
        d = cur - prev
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    out = [float("nan")] * period
    def rsi_of(g, l):
        if l == 0:
            return 100.0
        return 100 - 100 / (1 + g / l)
    out.append(rsi_of(avg_g, avg_l))
    for g, l in zip(gains[period:], losses[period:]):
        avg_g = (avg_g * (period - 1) + g) / period
        avg_l = (avg_l * (period - 1) + l) / period
        out.append(rsi_of(avg_g, avg_l))
    return out


def test_rsi_matches_reference():
    rng = np.random.default_rng(7)
    prices = 100 + np.cumsum(rng.normal(0, 1.5, 120))
    s = weekly(prices)
    got = scanner.rsi_wilder(s, scanner.RSI_PERIOD).to_numpy()
    want = reference_rsi(list(prices), scanner.RSI_PERIOD)

    assert np.isnan(got[: scanner.RSI_PERIOD]).all(), "warm-up must be NaN"
    for i in range(scanner.RSI_PERIOD, len(prices)):
        assert abs(got[i] - want[i]) < 1e-6, f"RSI mismatch at {i}: {got[i]} vs {want[i]}"
    assert ((got[scanner.RSI_PERIOD:] >= 0) & (got[scanner.RSI_PERIOD:] <= 100)).all()


def test_rsi_extremes():
    up = scanner.rsi_wilder(weekly(np.arange(100, 140, dtype=float)), 14)
    assert abs(up.iloc[-1] - 100.0) < 1e-9, "unbroken advance is RSI 100"
    down = scanner.rsi_wilder(weekly(np.arange(140, 100, -1, dtype=float)), 14)
    assert abs(down.iloc[-1] - 0.0) < 1e-9, "unbroken decline is RSI 0"


def test_find_pivots():
    vals = np.array([5, 4, 3, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 5, 6, 7], dtype=float)
    lows = scanner.find_pivots(vals, 3, "low")
    highs = scanner.find_pivots(vals, 3, "high")
    assert lows == [3, 13], lows
    assert highs == [9], highs
    # No pivot can sit inside the first or last `window` bars.
    assert all(3 <= p < len(vals) - 3 for p in lows + highs)


def test_to_weekly_takes_friday_close():
    days = pd.date_range("2026-01-05", periods=10, freq="D")   # Mon .. Wed
    daily = pd.Series(np.arange(10, dtype=float), index=days)
    wk = scanner.to_weekly(daily)
    assert list(wk.index.strftime("%Y-%m-%d")) == ["2026-01-09", "2026-01-16"]
    assert wk.iloc[0] == 4.0, "week 1 closes on Friday"
    assert wk.iloc[1] == 9.0, "a part-week is stamped with its Friday anyway"


def bullish_divergence_series():
    """Lower price low, higher RSI low, confirmed 3 weeks back."""
    seg = []
    seg += list(np.linspace(100, 60, 21))    # 0-20  hard sell-off -> RSI 0
    seg += list(np.linspace(62, 75, 10))     # 21-30 rally
    seg += list(np.linspace(74, 58, 10))     # 31-40 shallower sell-off, lower low
    seg += [59, 60.5, 62]                    # 41-43 turn up, confirming pivot 40
    return weekly(seg)


def test_scan_finds_regular_bullish():
    stock = scanner.StockSeries(bullish_divergence_series(), "TESTCO")
    assert stock.ok
    assert 20 in stock.lows and 40 in stock.lows, stock.lows

    strict = scanner.scan(stock, bull_max=30.0, bear_min=70.0, recency=1,
                          include_hidden=False)
    kinds = {s.kind: s for s in strict}
    assert "REGULAR BULLISH" in kinds, f"expected a bullish hit, got {list(kinds)}"
    sig = kinds["REGULAR BULLISH"]
    assert sig.price2 < sig.price1, "price must make the lower low"
    assert sig.rsi2 > sig.rsi1, "RSI must make the higher low"
    assert sig.rsi1 < 30.0, "first pivot must clear the strict oversold gate"
    assert sig.bars_ago == 3
    assert "REGULAR BEARISH" not in kinds


def test_recency_and_gap_filters():
    stock = scanner.StockSeries(bullish_divergence_series(), "TESTCO")
    # bars_ago is 3, so a recency budget of 1 week (+ PIVOT_WINDOW) still admits it.
    assert scanner.scan(stock, 30.0, 70.0, 1, False)

    stale = scanner.StockSeries(
        pd.concat([bullish_divergence_series(),
                   weekly(np.linspace(63, 90, 30), start="2024-11-08")]), "STALE")
    assert not [s for s in scanner.scan(stale, 30.0, 70.0, 1, False)
                if s.kind == "REGULAR BULLISH"], "old divergence must age out"


def test_uptrend_yields_nothing():
    stock = scanner.StockSeries(weekly(np.linspace(50, 150, 80)), "TRENDER")
    assert scanner.scan(stock, 30.0, 70.0, 1, False) == []


def test_short_history_is_skipped():
    stock = scanner.StockSeries(weekly(np.linspace(100, 110, 20)), "TINY")
    assert not stock.ok
    assert scanner.scan(stock, 30.0, 70.0, 1, False) == []


def test_signal_row_shape():
    s = scanner.Signal("ACME", "REGULAR BULLISH", "2026-01-02", "2026-03-06",
                       101.234, 98.765, 28.44, 41.57, 3)
    row = s.row("STRICT")
    assert row["Tier"] == "STRICT" and row["Ticker"] == "ACME"
    assert row["Price 1"] == 101.23 and row["RSI 2"] == 41.6
    assert s.key() == ("ACME", "REGULAR BULLISH")
    assert list(row) == ["Tier", "Ticker", "Signal", "Pivot 1", "Pivot 2",
                         "Price 1", "Price 2", "RSI 1", "RSI 2", "Weeks ago"]


def test_relaxed_pass_excludes_strict_hits():
    stock = scanner.StockSeries(bullish_divergence_series(), "TESTCO")
    with contextlib.redirect_stdout(io.StringIO()):    # keep the tier report quiet
        rows = scanner.run_passes([stock])
    tiers = [r["Tier"] for r in rows]
    assert tiers.count("STRICT") == 1
    assert "RELAXED" not in tiers, "a strict hit must not repeat in the relaxed tier"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"  ok   {t.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"  FAIL {t.__name__}: {e}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
