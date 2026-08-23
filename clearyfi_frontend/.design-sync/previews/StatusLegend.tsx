import { StatusLegend } from "@clearyfi/design-prototype";

/** All four tokens — the default, and usually what a page footer wants. */
export function AllFour() {
  return <StatusLegend />;
}

/** Restricted to the two drained tokens, for a surface that only ever shows those. */
export function DrainedOnly() {
  return <StatusLegend statuses={["na", "nm"]} />;
}
