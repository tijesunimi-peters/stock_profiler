/**
 * ClearyFi design system — React components for the warm "paper terminal" SEC-filings product.
 *
 * Import the stylesheet once at the app root:
 *   import '@clearyfi/design-prototype/styles.css';
 *
 * Then compose. Class names emitted here are the SAME class names the shipped
 * `window.ClearyFi.*` builders use, so a design made with these components maps directly onto
 * production markup.
 */
export { STATUS_META, isDrained, formatMetric } from "./types.js";
// shell
export { AppShell } from "./components/AppShell.js";
export { EntityBar } from "./components/EntityBar.js";
export { ViewRail } from "./components/ViewRail.js";
export { AppFooter } from "./components/AppFooter.js";
// page structure
export { Masthead } from "./components/Masthead.js";
export { SectionHead } from "./components/SectionHead.js";
// status + provenance (load-bearing — STYLE_GUIDE §7/§8)
export { StatusChip } from "./components/StatusChip.js";
export { StatusLegend } from "./components/StatusLegend.js";
export { SourceBadge } from "./components/SourceBadge.js";
export { Provenance } from "./components/Provenance.js";
export { Disclosure, STANDARD_DISCLOSURES } from "./components/Disclosure.js";
// controls
export { Button } from "./components/Button.js";
export { SegmentedControl } from "./components/SegmentedControl.js";
export { TickerChip } from "./components/TickerChip.js";
// metrics
export { MetricCard } from "./components/MetricCard.js";
export { MetricCardGrid } from "./components/MetricCardGrid.js";
export { MetricTile } from "./components/MetricTile.js";
export { MetricTileGrid } from "./components/MetricTileGrid.js";
export { StatTile } from "./components/StatTile.js";
export { StatTileRow } from "./components/StatTileRow.js";
// data display
export { StatementTable } from "./components/StatementTable.js";
export { ChartCard } from "./components/ChartCard.js";
export { StateBlock } from "./components/StateBlock.js";
// sector analytics
export { SectorScoreTile } from "./components/SectorScoreTile.js";
export { FavorabilityDelta } from "./components/FavorabilityDelta.js";
export { CompositionStrip } from "./components/CompositionStrip.js";
export { DistributionStrip } from "./components/DistributionStrip.js";
// global search
export { SearchSuggest } from "./components/SearchSuggest.js";
