import * as React from 'react';

/**
 * CompositionStrip — from @clearyfi/design-prototype@0.1.0.
 */
export interface CompositionStripProps {
  segments: CompositionSegment[];
  /** Minimum share a band needs before its label sits *inside* it. Narrower bands move their label to the legend below rather */
  insideLabelMin?: number;
  className?: string;
}

export declare const CompositionStrip: React.ComponentType<CompositionStripProps>;
