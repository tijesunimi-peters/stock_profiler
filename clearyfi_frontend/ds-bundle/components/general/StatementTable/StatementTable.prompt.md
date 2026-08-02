StatementTable from @clearyfi/design-prototype. Use via `window.ClearyFiDS.StatementTable` (bundle loaded from the root `_ds_bundle.js`).

The audit-grade statement table (STYLE_GUIDE §6): mono tabular amounts, a source-tag column
with a US-GAAP/extension badge per row, tinted header under a 2px ink underline.

The source column is the point. Anyone can render a balance sheet; showing which tag each
number came from — and flagging the filer's own extension tags as less comparable — is what
makes it checkable. Do not drop that column to save width.

## Props

```ts
interface StatementTableProps {
  rows: StatementRow[];
  /** Column header over the amounts, e.g. `FY2024 (USD)`. */
  amountHeader?: string;
  /** Column header over the line-item labels. */
  labelHeader?: string;
  /** Mono caption under the table — units, fiscal calendar, restatement basis. */
  caption?: string;
  className?: string;
}
```
