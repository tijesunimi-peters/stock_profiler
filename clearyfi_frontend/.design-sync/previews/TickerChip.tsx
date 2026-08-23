import { TickerChip } from "@clearyfi/design-prototype";

/** A single symbol, as it appears in an entity header. */
export function Single() {
  return <TickerChip symbol="AAPL" />;
}

/** A peer set — the usual multi-chip case. */
export function PeerSet() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <TickerChip symbol="AAPL" />
      <TickerChip symbol="MSFT" />
      <TickerChip symbol="NVDA" />
      <TickerChip symbol="GOOGL" />
      <TickerChip symbol="AMZN" />
    </div>
  );
}
