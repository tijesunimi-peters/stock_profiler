export interface StatementRow {
    /** Line-item label, e.g. `Total revenue`. */
    label: string;
    /**
     * Pre-formatted amount. Pass the drained token (`N/A`) rather than `0` for an absent line —
     * a zero here is a factual claim the filing did not make.
     */
    amount: string;
    /** Render the amount drained (absent/inapplicable rather than a real figure). */
    drained?: boolean;
    /** The US-GAAP or extension tag this line came from. */
    sourceTag?: string;
    /** Whether `sourceTag` is a company extension tag. */
    isExtension?: boolean;
}
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
/**
 * The audit-grade statement table (STYLE_GUIDE §6): mono tabular amounts, a source-tag column
 * with a US-GAAP/extension badge per row, tinted header under a 2px ink underline.
 *
 * The source column is the point. Anyone can render a balance sheet; showing which tag each
 * number came from — and flagging the filer's own extension tags as less comparable — is what
 * makes it checkable. Do not drop that column to save width.
 */
export declare function StatementTable({ rows, amountHeader, labelHeader, caption, className, }: StatementTableProps): import("react").JSX.Element;
