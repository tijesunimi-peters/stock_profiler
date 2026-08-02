/**
 * The Company Hub's PRODUCT KNOWLEDGE — the half of `hub.ts` that is not data.
 *
 * `hub.ts` currently holds two different kinds of thing under one roof:
 *
 *   * **figures** — `hubData`, `instRegister`, … deterministic-synthetic fixtures that stand in
 *     for filings. These reach views through the seam (`data/api.ts`) and **they die at Phase A**,
 *     replaced by `/v1` responses.
 *   * **structure** — section ordinals, the label→metric-id map, unit formatters, the derivation
 *     formulas behind each `ƒ derived` chip, the glossary, EDGAR URL construction. None of it is a
 *     filing fact, none of it comes from an endpoint, and **all of it survives Phase A unchanged.**
 *
 * Routing structure through an async seam would be a lie about where it comes from — and it would
 * make a section heading unavailable while a fetch is in flight. So it is imported directly, the
 * same way `catalog.ts` holds the metric definitions (favorability, formulas, source forms) that
 * are "product knowledge rather than mock data".
 *
 * Re-exported rather than physically moved: `hub.ts`'s fixture builders consume several of these
 * (`MIX_COLORS`, `Q_LABELS`), so a move would mean editing a file this task must otherwise leave
 * alone. When the fixtures are deleted at Phase A, these definitions move here for real.
 */
export {
  // Section navigation — the ordinals the rails address.
  HUB_SECTIONS,
  INST_SECTIONS,
  INST_HEADS,
  // Display maps and formatters.
  LABEL_TO_ID,
  unitFmt,
  Q_LABELS,
  A_LABELS,
  // Our documented derivations: formula, inputs, and the condition under which our number and the
  // filer's own legitimately differ. This is the `ƒ derived` chip's whole content.
  HUB_CALCS,
  // Manager-type vocabulary for the register mix. Categorical identity, not a ranking.
  MIX_KINDS,
  MIX_COLORS,
  INST_GLOSSARY,
  // Deterministic EDGAR URL construction from a CIK — not a fact, a link.
  edgarLink,
} from "./hub";

export type { HubCalc, Calc, SnapshotTile, MetricDef, SeriesResult, StatementRowData } from "./hub";

/*
 * Structure from the OTHER ported modules, same rule: not a filing fact, no endpoint behind it,
 * survives Phase A unchanged.
 *   `CODES`      — the Form 4 transaction-code vocabulary (P = open-market buy, S = sale, …).
 *                  Defined by the SEC, not by a filer.
 *   `PX_GROUPS`  — the Peer-relative rail's switch groups.
 *   `METRIC_DEFS`/`fmtVal` — metric definitions and their formatters, the same class of thing
 *                  `catalog.ts` holds for the sector views.
 */
export { CODES } from "./insider";
export type { Side, CodeDef, LedgerRow, InsiderData, F144Notice } from "./insider";
export { PX_GROUPS, METRIC_DEFS, fmtVal } from "./peers";
export type { PeerXRow, PresenceTable, MethodMix, PeerExtras, DistRow } from "./peers";
