import * as React from 'react';

/**
 * AppFooter — from @clearyfi/design-prototype@0.1.0.
 */
export interface AppFooterProps {
  links?: FooterLink[];
  /** Muted right-aligned tagline. */
  tagline?: string;
  className?: string;
}

export declare const AppFooter: React.ComponentType<AppFooterProps>;
