import * as React from 'react';

/**
 * StatementTable — from @clearyfi/design-prototype@0.1.0.
 */
export interface StatementTableProps {
  rows: StatementRow[];
  /** Column header over the amounts, e.g. `FY2024 (USD)`. */
  amountHeader?: string;
  /** Column header over the line-item labels. */
  labelHeader?: string;
  /** Mono caption under the table — units, fiscal calendar, restatement basis. */
  caption?: string;
  className?: string;
}

export declare const StatementTable: React.ComponentType<StatementTableProps>;
