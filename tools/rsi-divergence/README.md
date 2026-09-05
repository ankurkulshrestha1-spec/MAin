# RSI Divergence Scanner — NIFTY 500, weekly

Scans every Nifty 500 constituent for regular RSI divergence on **weekly** bars
and reports it in two tiers, so a quiet market produces a watchlist instead of an
empty screen.

| Tier | RSI gate | Recency | Meaning |
|---------|---------------|----------|-------------------------------------------|
| STRICT | < 30 / > 70 | 1 week | At a genuine extreme. Highest conviction. |
| RELAXED | < 40 / > 60 | 3 weeks | Developing setup. Watch, don't act. |

The relaxed pass never repeats a name already flagged as strict. Both tiers land
in `divergence_signals_weekly.csv` with a `Tier` column.

If STRICT is empty and RELAXED has hits, the scanner is healthy — nothing is at a
true extreme. If **both** are empty, check the failed-symbol count first; a wiped
result is almost always a failed download, not a quiet market.

## Running it

**Colab** (what it was written for) — two cells:

```python
!pip install yfinance -q
```

```python
# paste rsi_divergence_nifty500.py here and run
```

**Locally:**

```bash
pip install -r requirements.txt
python3 rsi_divergence_nifty500.py
```

Constituents come from niftyindices.com, falling back to the NSE archives. NSE
blocks datacenter IPs often enough that a manual fallback is built in: in Colab
it prompts for an upload of `ind_nifty500list.csv`; outside Colab it exits and
tells you to load the CSV yourself.

Prices come from Yahoo (`SYMBOL.NS`), 5 years of daily bars downloaded in batches
of 50 and resampled to Friday closes. Downloads happen **once** and both passes
reuse the same in-memory series, so adding a tier costs no extra bandwidth.

## Configuration

Everything worth changing sits in the `CONFIG` block at the top:

| Name | Default | Meaning |
|-----------------|---------|---------------------------------------------|
| `RSI_PERIOD` | 14 | Wilder RSI lookback, in weekly bars |
| `PIVOT_WINDOW` | 3 | Bars either side of a swing high/low |
| `MIN_PIVOT_GAP` | 4 | Minimum weeks between the two pivots |
| `MAX_PIVOT_GAP` | 26 | Maximum weeks between them (~6 months) |
| `LOOKBACK` | `5y` | Daily history pulled before resampling |
| `BATCH_SIZE` | 50 | Symbols per Yahoo request |
| `PASSES` | 2 tiers | `(name, bull_max, bear_min, recency, hidden)` |

Add a third tier by appending to `PASSES` — e.g. hidden (continuation)
divergence, which the scanner supports but leaves off by default:

```python
("HIDDEN", 100.0, 0.0, 2, True),
```

## Two things to know before you trust the output

**Signals are always at least `PIVOT_WINDOW` weeks old.** A swing low is only a
swing low once three bars have closed above it, so the effective recency budget
is `recency + PIVOT_WINDOW`, and a "1 week" strict pass will surface pivots up to
four weeks back. That lag is inherent to pivot detection, not a bug — but it does
mean price has already moved some distance by the time a name appears.

**The RSI gate is tested on the first pivot, not the second.** A bullish signal
requires the *earlier* low to be oversold and the later RSI merely to be higher.
So `RSI 28 -> 55` qualifies as strict. If you want both legs held at the extreme,
change the gate in `scan()` to close over the second reading:

```python
check(stock.lows, lambda p1, p2: p2 < p1, lambda r1, r2: r2 > r1 + 1.0,
      lambda r1: r1 < bull_max, "REGULAR BULLISH")     # gate on pivot 1 (default)
```

Passing `r2` instead is a stricter, and arguably more standard, reading. It is
left as-is here so results match the tier table above.

## Tests

```bash
python3 test_rsi_divergence.py
```

Ten offline checks — no network, no Yahoo calls. They cover the RSI against an
independently written textbook implementation, pivot detection, weekly
resampling, the recency and gap filters, a hand-built bullish divergence, and the
strict/relaxed de-duplication.

`rsi_wilder` uses Wilder's own seeding (mean of the first `period` moves, then
recursive smoothing) rather than a bare `ewm(alpha=1/period)`, so values match
what a charting platform prints from the first printed bar instead of converging
onto it a few hundred bars later.

## Limitations

- Yahoo rate-limits aggressively. If more than half the symbols fail, the script
  says so and tells you the results are not trustworthy — wait and re-run rather
  than reading the output.
- Weekly bars mean roughly one new data point per name per week. Running this
  daily is not more information, only more noise.
- Divergence is a warning, not a trigger. Confirm against price structure.
