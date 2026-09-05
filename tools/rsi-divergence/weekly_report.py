#!/usr/bin/env python3
"""Weekly STRICT-tier divergence report, in a shape you can put in an email.

Runs the scanner over the Nifty 500 and writes, into --out-dir:

    report.txt      plain-text body
    report.html     HTML body (inline styles — email clients strip <style>)
    subject.txt     one-line subject
    signals.csv     the rows, same columns as the Colab script

and prints the text body to stdout. It sends nothing itself: the caller
(a GitHub Actions mail step, or Claude with the Gmail connector) does that.

    python3 weekly_report.py --out-dir out
    python3 weekly_report.py --tier RELAXED --symbols-file ind_nifty500list.csv
    python3 weekly_report.py --limit 25          # smoke test, first 25 symbols

Exit codes:  0 report written (with or without signals) · 2 data too poor to
trust · 3 no constituent list.
"""

import argparse
import datetime as dt
import html
import io
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rsi_divergence_nifty500 as scanner

MIN_COVERAGE = 0.5      # below this share of usable histories, don't send a verdict


def load_symbols(symbols_file):
    if symbols_file:
        df = pd.read_csv(symbols_file)
        col = "Symbol" if "Symbol" in df.columns else df.columns[2]
        return df[col].astype(str).str.strip().tolist()
    return scanner.get_nifty500_symbols()


def tier_config(name):
    for row in scanner.PASSES:
        if row[0].upper() == name.upper():
            return row
    raise SystemExit(f"No tier named {name!r}. Known: "
                     + ", ".join(r[0] for r in scanner.PASSES))


def collect(stocks, tier):
    name, bull_max, bear_min, recency, hidden = tier
    signals = []
    for st in stocks:
        signals.extend(scanner.scan(st, bull_max, bear_min, recency, hidden))
    signals.sort(key=lambda s: (s.kind, s.bars_ago, s.ticker))
    return signals


def as_of(stocks):
    """Latest weekly bar across the universe — the data the report speaks for."""
    dates = [st.close.index[-1] for st in stocks if st.ok and st.n]
    return max(dates).date() if dates else None


def text_body(signals, tier_name, stats):
    out = io.StringIO()
    w = out.write
    w(f"NIFTY 500 — weekly RSI divergence, {tier_name} tier\n")
    w(f"Run {stats['run_date']}"
      + (f" · data through {stats['as_of']}" if stats['as_of'] else "")
      + f" · {stats['usable']}/{stats['requested']} histories usable\n")
    if stats["degraded"]:
        w("\n[!] More than half the downloads failed. Yahoo was most likely\n"
          "    rate-limiting. Treat the list below as incomplete.\n")
    w("\n")
    if not signals:
        w("No signals at this tier. Nothing in the index is diverging at a\n"
          "genuine RSI extreme this week.\n")
    else:
        for kind in sorted({s.kind for s in signals}):
            rows = [s for s in signals if s.kind == kind]
            w(f"{kind} ({len(rows)})\n")
            for s in rows:
                w(f"  {s.ticker:<12} {s.price1:>9.2f} -> {s.price2:>9.2f}   "
                  f"RSI {s.rsi1:>5.1f} -> {s.rsi2:>5.1f}   "
                  f"{s.date1} / {s.date2}   {s.bars_ago}w ago\n")
            w("\n")
    w("\nDivergence is a warning, not a trigger. Confirm against price\n"
      "structure before acting. Signals are 3+ weeks old by construction —\n"
      "a swing pivot is only confirmed once three bars close past it.\n")
    return out.getvalue()


def html_body(signals, tier_name, stats):
    css_td = "padding:6px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace"
    css_th = ("padding:6px 10px;text-align:left;border-bottom:2px solid #333;"
              "font-family:system-ui,sans-serif;font-size:13px")
    p = []
    p.append('<div style="font-family:system-ui,-apple-system,sans-serif;'
             'color:#1a1a1a;max-width:760px">')
    p.append(f'<h2 style="margin:0 0 4px">NIFTY 500 — weekly RSI divergence'
             f'<span style="color:#666;font-weight:400"> · {html.escape(tier_name)} '
             f'tier</span></h2>')
    sub = f"Run {stats['run_date']}"
    if stats["as_of"]:
        sub += f" &middot; data through {stats['as_of']}"
    sub += f" &middot; {stats['usable']}/{stats['requested']} histories usable"
    p.append(f'<p style="margin:0 0 16px;color:#666;font-size:13px">{sub}</p>')

    if stats["degraded"]:
        p.append('<p style="background:#fff4e5;border-left:3px solid #d97706;'
                 'padding:10px 12px;margin:0 0 16px;font-size:13px">'
                 '<strong>More than half the downloads failed.</strong> Yahoo was '
                 'most likely rate-limiting. Treat this list as incomplete.</p>')

    if not signals:
        p.append('<p style="padding:14px;background:#f5f5f5;border-radius:4px">'
                 'No signals at this tier. Nothing in the index is diverging at a '
                 'genuine RSI extreme this week.</p>')
    else:
        for kind in sorted({s.kind for s in signals}):
            rows = [s for s in signals if s.kind == kind]
            accent = "#15803d" if "BULLISH" in kind else "#b91c1c"
            p.append(f'<h3 style="margin:20px 0 6px;font-size:15px;color:{accent}">'
                     f'{html.escape(kind)} ({len(rows)})</h3>')
            p.append('<table style="border-collapse:collapse;width:100%;font-size:13px">')
            p.append(f'<tr><th style="{css_th}">Ticker</th>'
                     f'<th style="{css_th}">Price</th>'
                     f'<th style="{css_th}">RSI</th>'
                     f'<th style="{css_th}">Pivots</th>'
                     f'<th style="{css_th}">Age</th></tr>')
            for s in rows:
                p.append(
                    f'<tr><td style="{css_td}"><strong>{html.escape(s.ticker)}</strong></td>'
                    f'<td style="{css_td}">{s.price1:,.2f} &rarr; {s.price2:,.2f}</td>'
                    f'<td style="{css_td}">{s.rsi1:.1f} &rarr; {s.rsi2:.1f}</td>'
                    f'<td style="{css_td}">{s.date1} / {s.date2}</td>'
                    f'<td style="{css_td}">{s.bars_ago}w</td></tr>')
            p.append('</table>')

    p.append('<p style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;'
             'color:#666;font-size:12px">Divergence is a warning, not a trigger. '
             'Confirm against price structure before acting. Signals are 3+ weeks old '
             'by construction — a swing pivot is only confirmed once three bars close '
             'past it.</p></div>')
    return "\n".join(p)


def subject(signals, tier_name, stats):
    if stats["degraded"]:
        return f"[{tier_name}] Nifty 500 divergence — data incomplete, {len(signals)} signals"
    if not signals:
        return f"[{tier_name}] Nifty 500 divergence — nothing this week"
    bulls = sum(1 for s in signals if "BULLISH" in s.kind)
    bears = len(signals) - bulls
    return (f"[{tier_name}] Nifty 500 divergence — {len(signals)} signals "
            f"({bulls} bullish, {bears} bearish)")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tier", default="STRICT", help="tier from PASSES (default STRICT)")
    ap.add_argument("--out-dir", default=".", help="where to write the report files")
    ap.add_argument("--symbols-file", help="constituent CSV, if NSE is unreachable")
    ap.add_argument("--limit", type=int, help="only scan the first N symbols (smoke test)")
    args = ap.parse_args(argv)

    tier = tier_config(args.tier)
    tier_name = tier[0]

    try:
        symbols = load_symbols(args.symbols_file)
    except SystemExit as e:
        print(f"Could not get the constituent list: {e}", file=sys.stderr)
        return 3
    if args.limit:
        symbols = symbols[:args.limit]

    yahoo_syms = [s + ".NS" for s in symbols]
    print(f"Scanning {len(yahoo_syms)} symbols ({scanner.LOOKBACK} daily -> weekly)...",
          file=sys.stderr)
    stocks, failed = scanner.download_all(yahoo_syms)

    stats = {
        "run_date": dt.date.today().isoformat(),
        "as_of": as_of(stocks),
        "usable": len(stocks),
        "requested": len(yahoo_syms),
        "degraded": len(stocks) < len(yahoo_syms) * MIN_COVERAGE,
    }
    signals = collect(stocks, tier)

    os.makedirs(args.out_dir, exist_ok=True)
    body = text_body(signals, tier_name, stats)
    write = lambda name, s: open(os.path.join(args.out_dir, name), "w").write(s)
    write("report.txt", body)
    write("report.html", html_body(signals, tier_name, stats))
    write("subject.txt", subject(signals, tier_name, stats) + "\n")
    pd.DataFrame([s.row(tier_name) for s in signals]).to_csv(
        os.path.join(args.out_dir, "signals.csv"), index=False)

    print(body)
    if stats["degraded"]:
        print("Coverage too poor to trust — report written, but flagged.",
              file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
