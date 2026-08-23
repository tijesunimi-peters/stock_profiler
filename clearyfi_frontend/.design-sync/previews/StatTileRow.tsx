import { StatTile, StatTileRow } from "@clearyfi/design-prototype";

/** The coverage strip above an institutional-ownership chart. */
export function OwnershipCoverage() {
  return (
    <StatTileRow>
      <StatTile label="HOLDERS" value="1,284" note="13F filers reporting a position" />
      <StatTile label="SHARES HELD" value="8.9B" note="sum of reported positions" />
      <StatTile label="TOP 10 CONCENTRATION" value="41.7%" note="of reported institutional shares" />
      <StatTile label="SHORT INTEREST" value="N/A" drained note="Not reportable on Form 13F" />
    </StatTileRow>
  );
}
