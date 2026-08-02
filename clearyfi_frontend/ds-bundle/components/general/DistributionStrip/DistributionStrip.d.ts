import * as React from 'react';

/**
 * DistributionStrip — from @clearyfi/design-prototype@0.1.0.
 */
export interface DistributionStripProps {
  peers: DistributionPeer[];
  /** The company to distinguish. Omit for an unfocused distribution. */
  focalId?: string | number;
  /** Chart title (mono accent eyebrow). */
  title: string;
  /** Chart-specific caption. The excluded-peer count is appended automatically. */
  caption?: string;
  /** Formats a value for the axis labels. Defaults to one decimal place. */
  format?: (value: number) => string;
  /** Show min / median / max labels under the strip. */
  axisLabels?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export declare const DistributionStrip: React.ComponentType<DistributionStripProps>;
