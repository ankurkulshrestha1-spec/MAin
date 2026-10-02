# Weekly RSI Divergence Scanner (NSE)

`rsi_divergence_scanner.py` scans for weekly RSI divergences across two sets of instruments:

- **Indices**: every equity index listed on NSE's
  [Live Market Indices](https://www.nseindia.com/market-data/live-market-indices) page
  (broad market, sectoral, thematic and strategy indices, plus India VIX).
- **Stocks**: the Nifty 500 constituents.

## Run (Google Colab)

```
!pip install yfinance -q
```
Then paste the file into a cell and run it. Results go to `divergence_signals_weekly.csv`.

## Where the data comes from

| What | Main source | Fallback |
|---|---|---|
| List of indices | NSE `/api/allIndices` (the data behind the live-indices page) | Built-in list (`FALLBACK_INDICES`) |
| Index prices | Yahoo Finance, for the indices in `YAHOO_INDEX_MAP` | niftyindices.com historical-data endpoint |
| Nifty 500 list | niftyindices.com / NSE archives CSV | Upload the CSV by hand |
| Stock prices | Yahoo Finance (`.NS`) | One retry for any symbols that failed |

NSE often blocks cloud IPs, Colab's included. If that happens the scanner says so and
falls back to the built-in index list.

Settings are at the top of the file: RSI and pivot parameters, `PASSES` tiers,
`PIVOT_PRICE` (`close` or `hl`), `CLEAN_DIVERGENCE`, `SCAN_INDICES` / `SCAN_STOCKS`,
and `INDEX_SKIP_CATEGORIES`.
