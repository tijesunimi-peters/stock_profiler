import { ChartCard, CompositionStrip } from "@clearyfi/design-prototype";

/** A chart card wrapping a real plot, with the honesty caption this system requires. */
export function WithComposition() {
  return (
    <ChartCard
      title="INSTITUTIONAL OWNERSHIP CONCENTRATION"
      caption="Derived by diffing consecutive 13F quarter-end snapshots. Reported long positions only."
      note="Filings are due 45 days after quarter end; the latest quarter is incomplete until then."
    >
      <CompositionStrip
        segments={[
          { label: "Vanguard", share: 0.089 },
          { label: "BlackRock", share: 0.071 },
          { label: "State Street", share: 0.041 },
          { label: "Next 7 holders", share: 0.216 },
          { label: "All other 13F filers", share: 0.583 },
        ]}
      />
    </ChartCard>
  );
}

/** Wrapping a plain SVG — the card does not care what the plot is. */
export function WithSvg() {
  const pts = [12, 19, 17, 24, 31, 28, 36, 41];
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * 60} ${90 - v * 1.8}`)
    .join(" ");
  return (
    <ChartCard
      title="REVENUE BY FISCAL YEAR"
      caption="As reported in each year's 10-K, on an as-restated basis."
    >
      <svg viewBox="0 0 420 100" width="100%" height="110" role="img" aria-label="Revenue trend">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
      </svg>
    </ChartCard>
  );
}
