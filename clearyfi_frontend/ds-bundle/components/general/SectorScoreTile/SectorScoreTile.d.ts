import * as React from 'react';

/**
 * SectorScoreTile — from @clearyfi/design-prototype@0.1.0.
 */
export interface SectorScoreTileProps {
  /** Sector name, e.g. `Semiconductors & related devices`. */
  sector: string;
  /** Composite theme score, 0–100. This is a **position relative to other sectors** — not a grade, not a verdict, and never a */
  score: number;
  /** Direction of travel since the prior period. */
  direction?: "up" | "flat" | "down";
  /** The change, pre-formatted, e.g. `+4.2`. */
  delta?: string;
  /** What the score is composed of, e.g. `Profitability`. */
  theme?: string;
  /** Number of filers behind the score — coverage is part of the reading. */
  coverage?: string;
  className?: string;
}

export declare const SectorScoreTile: React.ComponentType<SectorScoreTileProps>;
