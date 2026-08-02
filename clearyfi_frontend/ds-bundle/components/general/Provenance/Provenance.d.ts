import * as React from 'react';

/**
 * Provenance — from @clearyfi/design-prototype@0.1.0.
 */
export interface ProvenanceProps {
  /** Plain-language formula, e.g. `Net income ÷ Revenue`. */
  formula?: string;
  /** TTM for flows, as-of for balances. **Never mix bases silently** (STYLE_GUIDE §8). */
  basis?: "TTM" | "as-of";
  /** Stated, never selectable. Everything served today is `as-restated`; offering a toggle with no point-in-time compute path */
  restatementBasis?: "as-restated" | "as-originally-reported";
  /** Filing date the value is current as of. */
  asOf?: string;
  /** The status this value carries — drives whether a "why" line is shown. */
  status?: "ok" | "approximate" | "na" | "nm";
  /** The specific reason for an `approximate`/`na`/`nm` flag. **Carry the source prose verbatim** — it is the only place a re */
  reason?: string;
  /** Open on first render. Default closed — provenance never blocks the primary read. */
  open?: boolean;
  className?: string;
}

export declare const Provenance: React.ComponentType<ProvenanceProps>;
