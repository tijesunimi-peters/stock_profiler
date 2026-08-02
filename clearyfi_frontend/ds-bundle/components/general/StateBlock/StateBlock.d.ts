import * as React from 'react';

/**
 * StateBlock — from @clearyfi/design-prototype@0.1.0.
 */
export interface StateBlockProps {
  /** `loading` — pulsing accent dot + shimmer, with a note when the path may be cold. `empty` — a filing is on record but not */
  variant: "loading" | "empty" | "notFound" | "error";
  /** Overrides the default title for the variant. */
  title?: string;
  /** Body copy. Say what the reader can do next. */
  copy?: string;
  /** Offered on `notFound` — give the reader somewhere real to go. */
  recovery?: RecoveryLink[];
  /** Shown under a `loading` state when the first request may be slow. */
  coldNote?: string;
  className?: string;
}

export declare const StateBlock: React.ComponentType<StateBlockProps>;
