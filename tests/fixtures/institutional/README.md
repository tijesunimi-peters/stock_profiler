# Institutional (13F, 13D/G) fixtures

Real SEC data, fetched live via `SECClient` and trimmed to keep the repo small — not
synthetic, not hand-edited beyond trimming rows / array slicing.

## 13F (Berkshire Hathaway Inc., CIK 1067983 — fetched 2026-07-04)

| File | What it is | Chosen because |
|---|---|---|
| `brk_submissions_trimmed.json` | First 40 entries of `filings.recent` from `/submissions/CIK0001067983.json` | Real mix of forms (13F-HR, 10-Q, 3, 4, 8-K, SCHEDULE 13G, ...); the slice's one 13F-HR (accession `0001193125-26-226661`, report period `2026-03-31`) matches the info-table fixture below. |
| `brk13f_2026q1_index.json` | Real directory listing (`index.json`) for accession `0001193125-26-226661` | Shows the real document set: `primary_doc.xml` (cover page) + `53405.xml` (info table, arbitrarily named) — what `_find_info_table_document` has to disambiguate. |
| `brk13f_2026q1_infotable_trimmed.xml` | Info table for the same 2026 Q1 13F-HR, trimmed to 5 `<infoTable>` rows | Modern filing: confirms `value` is whole dollars (e.g. $498,992,850 for 12,719,675 ALLY FINL shares ≈ $39.23/share). Includes 2 rows sharing one CUSIP (different sub-manager slices of the same position) to exercise multi-row-per-security. |
| `brk13f_2016q3_infotable_trimmed.xml` | Info table for a 2016 Q3 13F-HR (accession `0000950123-16-022377`), trimmed to 5 rows | Older filing: confirms `value` was reported in **thousands** of dollars back then (e.g. $488,930 thousand for 13,355,099 AAL shares ≈ $36.60/share) — the unit convention change documented in `sec/institutional.py`'s module docstring. |
| `brk13f_2026q1_coverpage.xml` | Full cover page (`primary_doc.xml`) for the same 2026 Q1 13F-HR, not trimmed (151 lines) | The `otherManagers2Info` roster of **14 co-filing Berkshire subsidiaries/insurers** (GEICO Corp, National Indemnity Co, Buffett Warren E, ...) that the info table's `<otherManager>` tags reference by `sequenceNumber` — confirms per-holding joint-filer attribution end to end. |
| `brk13f_2016q3_coverpage.xml` | Full cover page for the 2016 Q3 13F-HR, not trimmed (159 lines) | Same 14-manager `otherManagers2Info` roster as above, PLUS a separate, unnumbered `<otherManagersInfo>` block (one entry: "New England Asset Management Inc") — confirms that legacy block is real, distinct from the numbered one, and deliberately not parsed (nothing in the info table can reference it positionally). |

### Quirks these confirmed (see `sec/institutional.py` module docstring)

- A 13F's `primaryDocument` is the cover page, not the holdings — unlike a 10-K/10-Q,
  the actual `InstitutionalHolding` data is in a *separate* XML document whose filename
  isn't standardized (`53405.xml` here; `form13fInfoTable.xml` in the 2016 filing).
- The `value` field's unit (thousands vs. whole dollars) changed across these two real
  filings without any in-document flag saying so — confirmed by cross-checking
  value/shares against real historical share prices, not assumed.
- Joint filers are real and attributed at the individual-holding level, not just
  disclosed at the filing level: both cover pages list the same 14-manager
  `otherManagers2Info` roster, and every info-table row in both trimmed fixtures
  carries an `<otherManager>` tag (e.g. `"2,4,11"`) pointing at 1-3 of those managers.

## Schedule 13D/13G (Apple Inc. + RYTHM, Inc. — fetched 2026-07-05)

| File | What it is | Chosen because |
|---|---|---|
| `aapl_submissions_13dg_trimmed.json` | 9 *selected* (non-contiguous, unlike the 13F fixture above) entries from `/submissions/CIK0000320193.json`'s `filings.recent`: the 3 newest Schedule 13D/G entries, the 3 oldest, and 3 unrelated Form 4s | Deliberately spans the SEC's structured-XML transition: 3 modern `SCHEDULE 13G`/`SCHEDULE 13G/A` entries (2025-07-29 onward) and 3 legacy `SC 13G/A` entries (2016-2017, plain HTML/text) — real proof `_recent_13dg_filings` must (and does) exclude the latter. |
| `aapl_schedule13g_vanguard.xml` | Raw Schedule 13G XML, accession `0002100119-26-000139` | A typical passive 13G: one reporting person (Vanguard Capital Management), used to confirm the 13G cover-page field names (`issuerCik`, `eventDateRequiresFilingThisStatement`, `coverPageHeaderReportingPersonDetails`). |
| `rythm_schedule13d_rslgh.xml` | Raw Schedule 13D/A XML, accession `0001213900-26-023065` (issuer: RYTHM, Inc., CIK 1800637) | An activist/control-related 13D amendment with **6 jointly-filed reporting persons** (`reportingPersons/reportingPersonInfo`, repeated) — confirms 13D's schema (`issuerCIK`/`issuerCUSIP`/`dateOfEvent`, different tag casing and shape than 13G) needs its own parser, and exercises the "N rows per filing" case `BeneficialOwnership`'s list return was already designed for. |

### Quirks these confirmed (see `sec/institutional.py` module docstring)

- **The SEC transitioned Schedule 13D/G to structured XML.** Apple's filing history
  shows legacy form types (`SC 13G/A`, plain HTML/text) as recently as 2024-02-14 and
  modern structured-XML form types (`SCHEDULE 13G`, `SCHEDULE 13G/A`) from 2025-07-29
  onward — the exact SEC-wide compliance date isn't pinned here, just confirmed against
  these two companies' real data.
- **13D and 13G are different XML schemas**, not variants of one shared schema: 13G's
  cover page has `issuerCik`/`issuerCusips`/`eventDateRequiresFilingThisStatement` and
  exactly one `coverPageHeaderReportingPersonDetails` block; 13D has `issuerCIK`
  (different casing)/`issuerCUSIP`/`dateOfEvent` and a `reportingPersons` list that can
  hold several `reportingPersonInfo` blocks for joint filers.
- A Schedule 13G/A can legitimately report **0 shares / 0% of class** — confirmed via a
  live (non-fixture) fetch against Vanguard's real 2026-03-26 amendment for Apple,
  filed after an internal corporate realignment moved beneficial ownership to
  subsidiaries. Not a parsing bug; `shares_beneficially_owned=0`/`percent_of_class=0`
  is the filing's real content.
- `primaryDocument` for these filings follows the same viewer-path quirk as Forms 3/4/5
  and 13F (`SECClient.strip_viewer_subdir`) — but unlike 13F, the raw XML *is* the
  filing's only document; there's no separate info-table file to locate.

## Regenerating

Not scripted (one-off dev activity, same as the other fixture READMEs). Re-fetch via
`SECClient.get_json(...)` / `get_bytes(...)` against the URLs implied by the tables above
and re-trim (`filings.recent` array slicing; `<infoTable>` row removal via
`xml.etree.ElementTree`, not string editing) if you need to refresh these.
