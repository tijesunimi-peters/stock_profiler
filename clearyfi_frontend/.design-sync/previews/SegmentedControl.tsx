import { SegmentedControl } from "@clearyfi/design-prototype";

/** Period selection — the control's commonest use. */
export function PeriodSelect() {
  return (
    <SegmentedControl
      value="annual"
      options={[
        { value: "annual", label: "Annual" },
        { value: "quarterly", label: "Quarterly" },
        { value: "ttm", label: "TTM" },
      ]}
    />
  );
}

/** A longer option set, with the last one active. */
export function StatementSelect() {
  return (
    <SegmentedControl
      value="cashflow"
      options={[
        { value: "income", label: "Income" },
        { value: "balance", label: "Balance" },
        { value: "cashflow", label: "Cash flow" },
      ]}
    />
  );
}
