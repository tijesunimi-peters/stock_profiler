import { Disclosure } from "@clearyfi/design-prototype";

/** The canonical use: coverage limits on a 13F-derived view, one line per limit. */
export function CoverageLimits() {
  return (
    <Disclosure
      open
      items={[
        "13F reports quarter-end holdings, not transactions. Buys and sells are derived by diffing consecutive quarters.",
        "Filings are due 45 days after quarter end, so the most recent quarter is incomplete until that window closes.",
        "Long positions only. Short positions and most derivatives are not reportable on Form 13F.",
      ]}
    />
  );
}

/** A custom summary label, for a view with its own vocabulary of limits. */
export function CustomLabel() {
  return (
    <Disclosure
      open
      label="What this view does not cover"
      items={[
        "Segment margin is shown only where both revenue and operating income are tagged — roughly 35% of filers.",
        "Disclosed segment splits need not sum to consolidated revenue; shares are of the disclosed total.",
        "Geography reflects the filer's own reporting axis, which varies between companies.",
      ]}
    />
  );
}

/** Default closed — the disclosure never competes with the primary read. */
export function Collapsed() {
  return (
    <Disclosure
      items={[
        "Derived from quarter-end snapshots, not reported transactions.",
        "Long positions only.",
      ]}
    />
  );
}
