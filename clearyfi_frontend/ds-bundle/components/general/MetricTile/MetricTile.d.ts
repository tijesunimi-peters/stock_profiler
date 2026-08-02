import * as React from 'react';

/**
 * MetricTile — from @clearyfi/design-prototype@0.1.0.
 */
export interface MetricTileProps {
  metric: MetricValue;
  /** Show the value with the dashed underline that cues an expandable drawer. */
  expandable?: boolean;
  /** Period-over-period move, pre-formatted, e.g. `+2.1pp vs FY2023`. */
  move?: string;
  className?: string;
}

export declare const MetricTile: React.ComponentType<MetricTileProps>;
