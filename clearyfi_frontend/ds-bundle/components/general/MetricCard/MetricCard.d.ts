import * as React from 'react';

/**
 * MetricCard — from @clearyfi/design-prototype@0.1.0.
 */
export interface MetricCardProps {
  /** The metric, including its status, basis and reason. */
  metric: MetricValue;
  /** Plain-language formula shown under "Show your work". */
  formula?: string;
  /** Open the provenance disclosure on first render. */
  provenanceOpen?: boolean;
  className?: string;
}

export declare const MetricCard: React.ComponentType<MetricCardProps>;
