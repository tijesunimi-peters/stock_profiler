import * as React from 'react';

/**
 * SegmentedControl — from @clearyfi/design-prototype@0.1.0.
 */
export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  /** The currently active option's `value`. */
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}

export declare const SegmentedControl: React.ComponentType<SegmentedControlProps>;
