# The Monday routine

A Claude Routine fires every Monday at **08:00 IST** (`30 2 * * 1` — cron is
UTC), spawns a fresh session, runs `weekly_report.py` over the Nifty 500, and
emails the STRICT-tier report. It emails on quiet weeks too: `"nothing this
week"` is the normal result, and a silent job is indistinguishable from a broken
one.

## The environment it needs

The Routine cannot run in a **"Default — trusted network access"** environment.
That policy's egress proxy returns `403 Forbidden` for every host this scanner
depends on, so the scan completes with zero usable histories and reports an
empty market that is really an empty download.

Create an environment with unrestricted network access, or with an allowlist
covering:

| Host | Why |
|-------------------------------|--------------------------------------|
| `www.niftyindices.com` | Nifty 500 constituent CSV |
| `archives.nseindia.com` | constituent CSV, fallback |
| `fc.yahoo.com` | yfinance cookie/crumb handshake |
| `query1.finance.yahoo.com` | price history |
| `query2.finance.yahoo.com` | price history, fallback |

`pypi.org`, `files.pythonhosted.org` and `github.com` are already reachable
under every policy, so `pip install` and the clone work regardless.

To check the policy from inside a session:

```bash
curl -sS "$HTTPS_PROXY/__agentproxy/status"          # proxy state
python3 -c "import requests; requests.get('https://query1.finance.yahoo.com', timeout=10)"
```

A `ProxyError ... 403 Forbidden` means the policy is still blocking. Do not try
to route around it — move the Routine to an environment that permits the host.

## The prompt it fires

Each firing starts from nothing, so the prompt is self-contained:

```
Run the weekly Nifty 500 RSI divergence report and email me the result.

1. cd into the repo and check out the branch holding the scanner:
     git checkout claude/rsi-divergence-nifty500-07e1bz
   (once that branch is merged, use the default branch instead)
2. pip install -r tools/rsi-divergence/requirements.txt
3. python3 tools/rsi-divergence/weekly_report.py --out-dir /tmp/rsi-report
4. Email ankur.kulshrestha1@gmail.com using the Gmail connector:
     subject = contents of /tmp/rsi-report/subject.txt
     body    = contents of /tmp/rsi-report/report.html, sent as HTML
   Send the email even when there are no signals — a quiet week is a
   result, and silence would be indistinguishable from a broken job.
5. If the script exits 2 (more than half the downloads failed), still send
   the email: it renders its own "data incomplete" warning at the top.
   If it exits 3 (no constituent list), email a short note saying the NSE
   constituent download failed and no scan ran.

Do not change the scanner's thresholds or commit anything. This is a
read-and-report job.
```

## Managing it

The Routine appears in the Routines list on claude.ai. From a Claude session:

- `list_triggers` — find it and see `next_run_at` and the last run's outcome
- `update_trigger` — change the schedule, the prompt, or pause it (`enabled:false`)
- `fire_trigger` — run it now, off-schedule
- `delete_trigger` — remove it

Change the tier by editing step 3 in the prompt: `--tier RELAXED` reports the
watchlist instead. `--limit 25` makes a fast smoke-test run.

## If the Routine turns out to be the wrong shape

The alternative is a scheduled GitHub Actions workflow: GitHub's runners have
open network, so no environment change is needed, and the job runs whether or
not anyone opens Claude. It needs `MAIL_USERNAME` and `MAIL_PASSWORD` (a Gmail
app password) as repository secrets, and `weekly_report.py` already writes the
`subject.txt` / `report.html` files a mail step would consume.
