import * as React from 'react';

/**
 * FavorabilityDelta — from @clearyfi/design-prototype@0.1.0.
 */
export interface FavorabilityDeltaProps {
  /** Direction of travel. Drives the glyph (▲ / ▬ / ▼) and the muted earthy tint. This describes **direction**, never a good/ */
  direction: "up" | "flat" | "down";
  /** The change itself, pre-formatted, e.g. `+4.2` or `−1.8`. Always shown — never a bare arrow. */
  value: string;
  /** Optional trailing context, e.g. `vs prior quarter`. */
  context?: string;
  className?: string;
}

export declare const FavorabilityDelta: React.ComponentType<FavorabilityDeltaProps>;
