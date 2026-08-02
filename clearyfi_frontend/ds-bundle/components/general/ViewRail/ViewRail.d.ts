import * as React from 'react';

/**
 * ViewRail — from @clearyfi/design-prototype@0.1.0.
 */
export interface ViewRailProps {
  views: ViewRailItem[];
  /** The active view's `value`. */
  active: string;
  onChange?: (value: string) => void;
  /** The view's content. */
  children: React.ReactNode;
  className?: string;
}

export declare const ViewRail: React.ComponentType<ViewRailProps>;
