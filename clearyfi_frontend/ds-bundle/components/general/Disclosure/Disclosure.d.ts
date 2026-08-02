import * as React from 'react';

/**
 * Disclosure — from @clearyfi/design-prototype@0.1.0.
 */
export interface DisclosureProps {
  /** The coverage/caveat lines. One per limit — do not merge them into a paragraph. */
  items: string[];
  /** Summary label. */
  label?: string;
  open?: boolean;
  className?: string;
}

export declare const Disclosure: React.ComponentType<DisclosureProps>;
