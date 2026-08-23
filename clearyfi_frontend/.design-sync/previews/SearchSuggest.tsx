import { SearchSuggest } from "@clearyfi/design-prototype";

const ROSTER = [
  { ticker: "AAPL", cik: 320193, name: "Apple Inc." },
  { ticker: "MSFT", cik: 789019, name: "Microsoft Corporation" },
  { ticker: "NVDA", cik: 1045810, name: "NVIDIA Corporation" },
];

/**
 * The resting input, with the ⌘K affordance. The suggestion list is interaction-driven —
 * it appears only after typing — so a static card shows the closed state. `hotkey` binds the
 * key handler but has no visual signature of its own.
 */
export function Resting() {
  return (
    <div style={{ maxWidth: 420 }}>
      <SearchSuggest
        hotkey
        placeholder="Search ticker or CIK…"
        onSearch={async (q) => ROSTER.filter((r) => r.ticker.startsWith(q.toUpperCase()))}
        onPick={() => {}}
      />
    </div>
  );
}
