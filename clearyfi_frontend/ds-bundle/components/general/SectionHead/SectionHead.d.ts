import * as React from 'react';

/**
 * SectionHead — from @clearyfi/design-prototype@0.1.0.
 */
export interface SectionHeadProps {
  /** Mono section number, e.g. `01`. Rendered in the accent. */
  n: string;
  /** Section name. */
  title: string;
  className?: string;
}

export declare const SectionHead: React.ComponentType<SectionHeadProps>;
