import * as React from 'react';

/**
 * TickerChip — from @clearyfi/design-prototype@0.1.0.
 */
export interface TickerChipProps {
  /** The ticker symbol. Rendered upper-case. */
  symbol: string;
  className?: string;
}

export declare const TickerChip: React.ComponentType<TickerChipProps>;
