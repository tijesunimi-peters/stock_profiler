# Institutional (13F) fixtures

Real SEC data for Berkshire Hathaway Inc. (CIK 1067983), fetched live 2026-07-04 via
`SECClient` and trimmed to keep the repo small — not synthetic, not hand-edited beyond
trimming rows / array slicing.

| File | What it is | Chosen because |
|---|---|---|
| `brk_submissions_trimmed.json` | First 40 entries of `filings.recent` from `/submissions/CIK0001067983.json` | Real mix of forms (13F-HR, 10-Q, 3, 4, 8-K, SCHEDULE 13G, ...); the slice's one 13F-HR (accession `0001193125-26-226661`, report period `2026-03-31`) matches the info-table fixture below. |
| `brk13f_2026q1_index.json` | Real directory listing (`index.json`) for accession `0001193125-26-226661` | Shows the real document set: `primary_doc.xml` (cover page) + `53405.xml` (info table, arbitrarily named) — what `_find_info_table_document` has to disambiguate. |
| `brk13f_2026q1_infotable_trimmed.xml` | Info table for the same 2026 Q1 13F-HR, trimmed to 5 `<infoTable>` rows | Modern filing: confirms `value` is whole dollars (e.g. $498,992,850 for 12,719,675 ALLY FINL shares ≈ $39.23/share). Includes 2 rows sharing one CUSIP (different sub-manager slices of the same position) to exercise multi-row-per-security. |
| `brk13f_2016q3_infotable_trimmed.xml` | Info table for a 2016 Q3 13F-HR (accession `0000950123-16-022377`), trimmed to 5 rows | Older filing: confirms `value` was reported in **thousands** of dollars back then (e.g. $488,930 thousand for 13,355,099 AAL shares ≈ $36.60/share) — the unit convention change documented in `sec/institutional.py`'s module docstring. |

## Quirks these confirmed (see `sec/institutional.py` module docstring)

- A 13F's `primaryDocument` is the cover page, not the holdings — unlike a 10-K/10-Q,
  the actual `InstitutionalHolding` data is in a *separate* XML document whose filename
  isn't standardized (`53405.xml` here; `form13fInfoTable.xml` in the 2016 filing).
- The `value` field's unit (thousands vs. whole dollars) changed across these two real
  filings without any in-document flag saying so — confirmed by cross-checking
  value/shares against real historical share prices, not assumed.

## Regenerating

Not scripted (one-off dev activity, same as the other fixture READMEs). Re-fetch via
`SECClient.get_json(...)` / `get_bytes(...)` against the URLs implied by the table above
and re-trim (`filings.recent` array slicing; `<infoTable>` row removal via
`xml.etree.ElementTree`, not string editing) if you need to refresh these.
