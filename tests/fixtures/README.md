# Fixtures

Real SEC `companyfacts` payloads (`https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`),
fetched live 2026-07-03 via `secfin.sec.client.SECClient` and trimmed to keep the repo
small — not synthetic data, and not hand-edited beyond trimming.

| File | Company | CIK | Chosen because |
|---|---|---|---|
| `aapl_companyfacts.json` | Apple Inc. | 320193 | Standard commercial/tech shape — what the canonical schema targets. |
| `wmt_companyfacts.json` | Walmart Inc. | 104169 | Retailer — surfaces gaps standard tech companies don't (no discrete gross-profit/operating-expenses tag, no R&D). |
| `jpm_companyfacts.json` | JPMorgan Chase & Co. | 19617 | Bank — income statement doesn't fit the commercial cost-of-revenue/gross-profit shape at all; a real structural limitation, not a tagging gap. |

## Trimming

Each file keeps every `us-gaap` concept/tag exactly as SEC reported it (same tag names,
same nesting, same values) but only data points whose fiscal year is within the most
recent 2 fiscal years, and drops the `dei` taxonomy (unused by `flatten_company_facts`'s
default `taxonomy="us-gaap"`). This cuts a 4–8.5MB raw payload down to a few hundred KB
while keeping the real tag shapes `tests/test_real_fixtures.py` needs — that trimming
only drops older fiscal years, so it doesn't affect the most-recent-FY assertions those
tests make.

## Regenerating

Not scripted as a first-class tool (this was a one-off dev activity, not part of the
shipped pipeline) — re-fetch via `SECClient.get_json(client.company_facts_url(cik))` for
the CIKs above and re-apply the same trim (keep points where `fy >= max_fy - 1`) if you
need to refresh these.
