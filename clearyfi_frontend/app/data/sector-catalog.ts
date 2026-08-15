/**
 * The sector altitude's PRODUCT KNOWLEDGE — the half of `prototype.ts` / `qualitative.ts` that is
 * not a figure.
 *
 * Same split as `hub-catalog.ts`, and the same test: **would an endpoint ever return this?**
 *
 *   * **Display helpers** — `ord`, `rankOf`, `statusDot`, `dirChip` turn a value into a glyph or
 *     an ordinal. Formatting, not data.
 *   * **Presentation** — the geography palette.
 *   * **UI constants** — page size, the form-tab set.
 *   * **Track-2 vocabulary** — the risk-theme identities, which no endpoint will ever return
 *     because narrative extraction is out of scope.
 *
 * Everything with a NUMBER in it went the other way, through the seam: scores, shifts,
 * constituents, coverage, the geographic mix, filer counts. `SUB_COUNTS` and `BASE_PEER_COUNT`
 * looked structural and were not — "how many filers are in this sub-industry" is a fact about the
 * market, so routing it through the catalog would have quietly hard-coded a figure the API owns.
 * The sector port went further and found that the NAMES failed the test too; see below.
 *
 * Re-exported rather than moved, for the same reason as `hub-catalog`: the fixture builders
 * consume several of these, so a physical move would mean editing files this task should leave
 * alone. They move here for real when the fixtures are deleted.
 */
export {
  /*
   * ⚠️ The NAVIGATION VOCABULARY left this file on 2026-08-14.
   *
   * `SECTOR_NAMES`, `SECTOR_ABBR`, `SUB_NAMES` and `THEMES` used to be re-exported here as
   * "product knowledge" on the test above — *would an endpoint ever return this?* The answer
   * turned out to be yes for all four, and the eleven sector names were the clearest case: the
   * SEC assigns every filer a SIC code, `/v1/sectors` returns those groups with SEC's own labels,
   * and "Semiconductors" is not one of them. `SUB_NAMES` was worse — six sub-industries with no
   * source at any grain this project materializes.
   *
   * A theme's IDENTITY was the closest call and also went: `normalize/themes.py` owns the list
   * server-side and `/sectors/theme-scores` returns it, so a second copy here could only drift.
   *
   * What is left is genuinely ours: geography colours (presentation), display helpers
   * (formatting), and the Track-2 qualitative vocabulary below, which no endpoint will return.
   */
  // Geography vocabulary and palette — labels and colours, never the mix itself.
  GEO_LABELS,
  GEO_COLORS,
  // Display helpers.
  ord,
  rankOf,
  statusDot,
} from "./prototype";

export {
  // The risk-theme identities. Their coverage percentages are figures and go through the seam.
  QUAL_THEMES,
  // UI constants and display helpers.
  FORM_TABS,
  FILINGS_PER_PAGE,
  dirChip,
} from "./qualitative";

export type { QualTheme, ThemeFilings } from "./qualitative";
