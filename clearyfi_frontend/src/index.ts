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

// data shapes + the status vocabulary
export type {
  MetricStatus,
  MetricBasis,
  RestatementBasis,
  MetricValue,
  MetricTrendPoint,
} from "./types.js";
export { STATUS_META, isDrained, formatMetric } from "./types.js";

// shell
export { AppShell } from "./components/AppShell.js";
export type { AppShellProps, ShellSubject } from "./components/AppShell.js";
export { EntityBar } from "./components/EntityBar.js";
export type { EntityBarProps, EntityCell } from "./components/EntityBar.js";
export { ViewRail } from "./components/ViewRail.js";
export type { ViewRailProps, ViewRailItem, ViewRailSection } from "./components/ViewRail.js";
export { AppFooter } from "./components/AppFooter.js";
export type { AppFooterProps, FooterLink } from "./components/AppFooter.js";

// page structure
export { Masthead } from "./components/Masthead.js";
export type { MastheadProps } from "./components/Masthead.js";
export { SectionHead } from "./components/SectionHead.js";
export type { SectionHeadProps } from "./components/SectionHead.js";

// status + provenance (load-bearing — STYLE_GUIDE §7/§8)
export { StatusChip } from "./components/StatusChip.js";
export type { StatusChipProps } from "./components/StatusChip.js";
export { StatusLegend } from "./components/StatusLegend.js";
export type { StatusLegendProps } from "./components/StatusLegend.js";
export { SourceBadge } from "./components/SourceBadge.js";
export type { SourceBadgeProps } from "./components/SourceBadge.js";
export { Provenance } from "./components/Provenance.js";
export type { ProvenanceProps } from "./components/Provenance.js";
export { Disclosure, STANDARD_DISCLOSURES } from "./components/Disclosure.js";
export type { DisclosureProps } from "./components/Disclosure.js";

// controls
export { Button } from "./components/Button.js";
export type { ButtonProps } from "./components/Button.js";
export { SegmentedControl } from "./components/SegmentedControl.js";
export type {
  SegmentedControlProps,
  SegmentedControlOption,
} from "./components/SegmentedControl.js";
export { TickerChip } from "./components/TickerChip.js";
export type { TickerChipProps } from "./components/TickerChip.js";

// metrics
export { MetricCard } from "./components/MetricCard.js";
export type { MetricCardProps } from "./components/MetricCard.js";
export { MetricCardGrid } from "./components/MetricCardGrid.js";
export type { MetricCardGridProps } from "./components/MetricCardGrid.js";
export { MetricTile } from "./components/MetricTile.js";
export type { MetricTileProps } from "./components/MetricTile.js";
export { MetricTileGrid } from "./components/MetricTileGrid.js";
export type { MetricTileGridProps } from "./components/MetricTileGrid.js";
export { StatTile } from "./components/StatTile.js";
export type { StatTileProps } from "./components/StatTile.js";
export { StatTileRow } from "./components/StatTileRow.js";
export type { StatTileRowProps } from "./components/StatTileRow.js";

// data display
export { StatementTable } from "./components/StatementTable.js";
export type { StatementTableProps, StatementRow } from "./components/StatementTable.js";
export { PagedTable } from "./components/PagedTable.js";
export type { PagedTableProps } from "./components/PagedTable.js";
export { PagedList } from "./components/PagedList.js";
export type { PagedListProps } from "./components/PagedList.js";
export { Pager } from "./components/Pager.js";
export type { PagerProps } from "./components/Pager.js";
export { ChartCard } from "./components/ChartCard.js";
export type { ChartCardProps } from "./components/ChartCard.js";
export { StateBlock } from "./components/StateBlock.js";
export type { StateBlockProps, RecoveryLink } from "./components/StateBlock.js";

// sector analytics
export { SectorScoreTile } from "./components/SectorScoreTile.js";
export type { SectorScoreTileProps } from "./components/SectorScoreTile.js";
export { FavorabilityDelta } from "./components/FavorabilityDelta.js";
export type { FavorabilityDeltaProps } from "./components/FavorabilityDelta.js";
export { CompositionStrip } from "./components/CompositionStrip.js";
export type { CompositionStripProps, CompositionSegment } from "./components/CompositionStrip.js";
export { DistributionStrip } from "./components/DistributionStrip.js";
export type { DistributionStripProps, DistributionPeer } from "./components/DistributionStrip.js";

// global search
export { SearchSuggest } from "./components/SearchSuggest.js";
export type { SearchSuggestProps, Suggestion } from "./components/SearchSuggest.js";
