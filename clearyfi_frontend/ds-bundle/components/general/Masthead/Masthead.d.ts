import * as React from 'react';

/**
 * Masthead — from @clearyfi/design-prototype@0.1.0.
 */
export interface MastheadProps {
  /** Page title — Hanken 800, the largest type on the page. */
  title: string;
  /** Right-aligned mono meta lines. **State the as-of date here** — data is as of the latest filing, never real-time (STYLE_G */
  meta?: string[];
  /** Optional intro paragraph below the rule. */
  lede?: string;
  /** Mono accent kicker above the title. Omitted by default — inside the app shell the sidebar already brands the page, so an */
  eyebrow?: string;
  className?: string;
}

export declare const Masthead: React.ComponentType<MastheadProps>;
