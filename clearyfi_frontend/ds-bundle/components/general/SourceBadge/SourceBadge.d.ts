import * as React from 'react';

/**
 * SourceBadge — from @clearyfi/design-prototype@0.1.0.
 */
export interface SourceBadgeProps {
  /** `gaap` for a standard US-GAAP tag; `ext` for a company **extension** tag, which is the filer's own invention and therefo */
  kind: "gaap" | "ext";
  /** The source tag itself, e.g. `Revenues` or `AppleSegmentRevenue`. Defaults to the kind. */
  label?: string;
  className?: string;
}

export declare const SourceBadge: React.ComponentType<SourceBadgeProps>;
