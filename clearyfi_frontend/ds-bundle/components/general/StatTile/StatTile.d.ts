import * as React from 'react';

/**
 * StatTile — from @clearyfi/design-prototype@0.1.0.
 */
export interface StatTileProps {
  /** Mono uppercase micro-label. */
  label: string;
  /** The figure. Pass a pre-formatted string — the tile does not invent formatting. */
  value: string;
  /** Optional one-line qualifier under the value. */
  note?: string;
  /** Render the value drained, for a figure that is structurally unavailable. Use this rather than passing `0` or `—` for som */
  drained?: boolean;
  className?: string;
}

export declare const StatTile: React.ComponentType<StatTileProps>;
