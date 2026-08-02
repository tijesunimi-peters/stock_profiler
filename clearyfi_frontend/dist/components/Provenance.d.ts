import type { MetricBasis, MetricStatus, RestatementBasis } from "../types.js";
export interface ProvenanceProps {
    /** Plain-language formula, e.g. `Net income ÷ Revenue`. */
    formula?: string;
    /** TTM for flows, as-of for balances. **Never mix bases silently** (STYLE_GUIDE §8). */
    basis?: MetricBasis;
    /**
     * Stated, never selectable. Everything served today is `as-restated`; offering a toggle with
     * no point-in-time compute path behind it would fabricate rigor (§8.1).
     */
    restatementBasis?: RestatementBasis;
    /** Filing date the value is current as of. */
    asOf?: string;
    /** The status this value carries — drives whether a "why" line is shown. */
    status?: MetricStatus;
    /**
     * The specific reason for an `approximate`/`na`/`nm` flag. **Carry the source prose verbatim**
     * — it is the only place a reader learns that an absence is structural rather than missing
     * data (§9.11).
     */
    reason?: string | null;
    /** Open on first render. Default closed — provenance never blocks the primary read. */
    open?: boolean;
    className?: string;
}
/**
 * The "Show your work" disclosure that any computed figure must carry (STYLE_GUIDE §8).
 *
 * Closed by default, opens in place. This is mandatory for derived numbers, not optional
 * polish: a metric without its formula, basis, and flag reason is an assertion rather than
 * evidence, and the whole product is a bet on the difference.
 */
export declare function Provenance({ formula, basis, restatementBasis, asOf, status, reason, open, className, }: ProvenanceProps): import("react").JSX.Element;
