import * as React from 'react';

/**
 * StatusLegend — from @clearyfi/design-prototype@0.1.0.
 */
export interface StatusLegendProps {
  /** Restrict the legend to a subset. Defaults to all four — usually what you want. */
  statuses?: MetricStatus[];
  className?: string;
}

export declare const StatusLegend: React.ComponentType<StatusLegendProps>;
