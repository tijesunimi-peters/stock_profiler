import { FavorabilityDelta } from "@clearyfi/design-prototype";

/** The three directions. Direction of travel, never a good/bad verdict. */
export function Directions() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
      <FavorabilityDelta direction="up" value="+4.2" context="vs prior quarter" />
      <FavorabilityDelta direction="flat" value="0.0" context="vs prior quarter" />
      <FavorabilityDelta direction="down" value="−1.8" context="vs prior quarter" />
    </div>
  );
}

/** Without trailing context, for a dense row. */
export function Bare() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <FavorabilityDelta direction="up" value="+4.2" />
      <FavorabilityDelta direction="flat" value="0.0" />
      <FavorabilityDelta direction="down" value="−1.8" />
    </div>
  );
}
