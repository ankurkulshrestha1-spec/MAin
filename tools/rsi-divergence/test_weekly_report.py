"""Offline checks for the weekly report rendering — no network."""

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rsi_divergence_nifty500 as scanner
import weekly_report as wr

HEALTHY = {"run_date": "2026-09-07", "as_of": "2026-09-04",
           "usable": 498, "requested": 500, "degraded": False}
DEGRADED = dict(HEALTHY, usable=40, degraded=True)

SIGS = [
    scanner.Signal("HDFCBANK", "REGULAR BULLISH", "2026-06-05", "2026-08-14",
                   1620.5, 1588.25, 28.4, 41.6, 3),
    scanner.Signal("TITAN", "REGULAR BEARISH", "2026-05-08", "2026-08-14",
                   3410.0, 3502.75, 74.2, 66.1, 3),
]


def test_subject_lines():
    assert wr.subject(SIGS, "STRICT", HEALTHY) == (
        "[STRICT] Nifty 500 divergence — 2 signals (1 bullish, 1 bearish)")
    assert wr.subject([], "STRICT", HEALTHY) == (
        "[STRICT] Nifty 500 divergence — nothing this week")
    assert "incomplete" in wr.subject(SIGS, "STRICT", DEGRADED)


def test_text_body_lists_every_signal():
    body = wr.text_body(SIGS, "STRICT", HEALTHY)
    assert "HDFCBANK" in body and "TITAN" in body
    assert "REGULAR BULLISH (1)" in body and "REGULAR BEARISH (1)" in body
    assert "498/500 histories usable" in body
    assert "warning, not a trigger" in body


def test_empty_body_says_so_without_alarm():
    body = wr.text_body([], "STRICT", HEALTHY)
    assert "No signals at this tier" in body
    assert "[!]" not in body, "a quiet week is not a failure"


def test_degraded_body_warns():
    assert "[!]" in wr.text_body(SIGS, "STRICT", DEGRADED)
    assert "rate-limiting" in wr.html_body(SIGS, "STRICT", DEGRADED)


def test_html_escapes_ticker_text():
    evil = scanner.Signal("<script>x</script>", "REGULAR BULLISH", "2026-06-05",
                          "2026-08-14", 10.0, 9.0, 20.0, 30.0, 3)
    out = wr.html_body([evil], "STRICT", HEALTHY)
    assert "<script>" not in out and "&lt;script&gt;" in out


def test_tier_config_lookup():
    assert wr.tier_config("strict")[0] == "STRICT"
    assert wr.tier_config("RELAXED")[1] == 40.0
    try:
        wr.tier_config("NOPE")
    except SystemExit as e:
        assert "STRICT" in str(e)
    else:
        raise AssertionError("unknown tier must exit with the known list")


def synthetic_stock(ticker, seed):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2021-09-10", periods=260, freq="W-FRI")
    px = 100 * np.exp(np.cumsum(rng.normal(0.001, 0.035, 260)))
    return scanner.StockSeries(pd.Series(px, index=idx), ticker)


def test_collect_sorts_and_as_of():
    stocks = [synthetic_stock(f"SYN{i:03d}", 100 + i) for i in range(60)]
    sigs = wr.collect(stocks, wr.tier_config("RELAXED"))
    keys = [(s.kind, s.bars_ago, s.ticker) for s in sigs]
    assert keys == sorted(keys), "report order must be stable"
    assert str(wr.as_of(stocks)) == "2026-08-28"


def test_as_of_handles_empty_universe():
    assert wr.as_of([]) is None


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
