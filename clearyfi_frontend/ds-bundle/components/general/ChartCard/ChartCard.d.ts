import * as React from 'react';

/**
 * ChartCard — from @clearyfi/design-prototype@0.1.0.
 */
export interface ChartCardProps {
  /** Mono accent eyebrow above the plot. */
  title: string;
  /** The chart itself — an SVG, or any node. */
  children: React.ReactNode;
  /** The honesty caption. Carry what is **specific to this chart**; a standing caveat (e.g. "reported 13F long positions only */
  caption?: string;
  /** A second, smaller line for a secondary note. */
  note?: string;
  className?: string;
}

export declare const ChartCard: React.ComponentType<ChartCardProps>;
