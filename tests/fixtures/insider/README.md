# Insider (Forms 3/4/5) fixtures

Real SEC data for Apple Inc. (CIK 320193), fetched live 2026-07-04 via `SECClient` and
trimmed to keep the repo small — not synthetic, not hand-edited beyond trimming.

| File | What it is | Chosen because |
|---|---|---|
| `aapl_submissions_trimmed.json` | First 30 entries of `filings.recent` from `/submissions/CIK0000320193.json` | Real mix of insider (3/4) and non-insider (10-Q, 8-K, 144, SCHEDULE 13G, SD) forms to exercise `_recent_filings`'s filter, in the SEC's real newest-first order. |
| `aapl_form4_newstead.xml` | Raw ownership XML, accession `0001140361-26-025622` | A Form 4 with both non-derivative transactions (an RSU vesting `M` and a tax-withholding `F`) and a derivative transaction — exercises both tables, `isOfficer` reported as `"true"`/`"false"` (not `"1"`/`"0"` — schema version X0609), and a transaction with no `<value>` under `transactionPricePerShare` (only a footnote — RSU settlement has no cash price). |
| `aapl_form3_newstead.xml` | Raw ownership XML, accession `0001780525-26-000003` | An initial Form 3: `nonDerivativeTable` is empty, only `derivativeHolding` rows (no transaction, no `postTransactionAmounts`) — exercises the holdings path. |
| `aapl_form5_wagner.xml` | Raw ownership XML, accession `0000320193-24-000102` | A director (`isDirector` = `"1"`, no officer title) filing Form 5 — exercises the `isDirector`/`isOfficer` `"1"`/`"0"` flag format (older schema than the Form 4 above). |
| `brka_form4_davita_joint.xml` | Raw ownership XML, accession `0001193125-26-207021`, issuer DaVita Inc. (CIK 927066), fetched live 2026-07-05 | A **joint filer** Form 4 — two `<reportingOwner>` blocks (Berkshire Hathaway Inc. and Warren E. Buffett) sharing one `nonDerivativeTransaction` row. Exercises `parse_ownership_xml` emitting one row per reporting owner instead of collapsing to the first. |

## Quirk this confirmed (see `sec/insider.py` module docstring)

`primaryDocument` in `filings.recent` (e.g. `"xslF345X06/form4.xml"`) points at EDGAR's
*rendered-HTML* viewer path, not the raw XML — fetching that exact URL returns an HTML
document. The raw ownership XML lives at the filing's directory root under the same
filename, with the `xslF345X0N/` prefix stripped. Verified directly against the Form 4
fixture above (`.../000114036126025622/xslF345X06/form4.xml` → HTML;
`.../000114036126025622/form4.xml` → XML).

## Regenerating

Not scripted (one-off dev activity, same as `tests/fixtures/README.md`). Re-fetch via
`SECClient.get_json(client.submissions_url(cik))` / `SECClient.get_bytes(...)` and
re-apply the same trim (first 30 `filings.recent` entries; raw XML documents kept as-is)
if you need to refresh these.
