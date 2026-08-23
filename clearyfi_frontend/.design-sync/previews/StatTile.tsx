import { StatTile } from "@clearyfi/design-prototype";

/** A descriptive count — the summary figure that sits above a chart. */
export function Count() {
  return <StatTile label="HOLDERS" value="1,284" note="13F filers reporting a position" />;
}

/** A share, with the qualifier that makes it readable. */
export function Share() {
  return <StatTile label="TOP 10 CONCENTRATION" value="41.7%" note="of reported institutional shares" />;
}

/** Structurally unavailable — drained, never a zero or an em-dash. */
export function Drained() {
  return (
    <StatTile label="SHORT INTEREST" value="N/A" drained note="Not reportable on Form 13F" />
  );
}
