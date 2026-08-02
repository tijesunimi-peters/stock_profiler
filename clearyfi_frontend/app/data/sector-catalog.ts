/**
 * The sector altitude's PRODUCT KNOWLEDGE — the half of `prototype.ts` / `qualitative.ts` that is
 * not a figure.
 *
 * Same split as `hub-catalog.ts`, and the same test: **would an endpoint ever return this?**
 *
 *   * **Vocabulary** — sector and sub-industry names, their abbreviations, the geography labels
 *     and the theme identities. These are how the app NAVIGATES. A theme's identity is ours (see
 *     `normalize/themes.py`, which owns the same list server-side); its *score* is a figure.
 *   * **Display helpers** — `ord`, `rankOf`, `statusDot`, `dirChip` turn a value into a glyph or
 *     an ordinal. Formatting, not data.
 *   * **UI constants** — page size, the form-tab set.
 *
 * Everything with a NUMBER in it went the other way, through the seam: scores, shifts,
 * constituents, coverage, the geographic mix, filer counts. `SUB_COUNTS` and `BASE_PEER_COUNT`
 * look structural and are not — "how many filers are in this sub-industry" is a fact about the
 * market that Phase A reads from `/sectors`, so routing it through the catalog would have quietly
 * hard-coded a figure the API owns.
 *
 * Re-exported rather than moved, for the same reason as `hub-catalog`: the fixture builders
 * consume several of these, so a physical move would mean editing files this task should leave
 * alone. They move here for real when the fixtures are deleted.
 */
export {
  // Navigation vocabulary.
  SECTOR_NAMES,
  SECTOR_ABBR,
  SUB_NAMES,
  THEMES,
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
