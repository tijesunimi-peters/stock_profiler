import { StatementTable } from "@clearyfi/design-prototype";

/**
 * The canonical use: an income statement where every line carries the US-GAAP tag
 * it was read from. The source column is the point of the component.
 */
export function IncomeStatement() {
  return (
    <StatementTable
      labelHeader="Line item"
      amountHeader="FY2024 (USD)"
      caption="Values as reported, in USD. Fiscal year ends September. Basis: as-restated."
      rows={[
        {
          label: "Total revenue",
          amount: "$391.0B",
          sourceTag: "RevenueFromContractWithCustomerExcludingAssessedTax",
        },
        { label: "Cost of sales", amount: "($210.4B)", sourceTag: "CostOfGoodsAndServicesSold" },
        { label: "Gross profit", amount: "$180.7B", sourceTag: "GrossProfit" },
        {
          label: "Research and development",
          amount: "($31.4B)",
          sourceTag: "ResearchAndDevelopmentExpense",
        },
        { label: "Operating income", amount: "$123.2B", sourceTag: "OperatingIncomeLoss" },
        { label: "Net income", amount: "$93.7B", sourceTag: "NetIncomeLoss" },
      ]}
    />
  );
}

/**
 * Company extension tags sit beside standard ones and are badged differently —
 * they are the filer's own vocabulary, so less comparable across companies.
 */
export function WithExtensionTags() {
  return (
    <StatementTable
      labelHeader="Segment"
      amountHeader="FY2024 (USD)"
      caption="Segment revenue as disclosed. Extension tags are filer-defined and not comparable across companies."
      rows={[
        {
          label: "Data Center",
          amount: "$47.5B",
          sourceTag: "DataCenterSegmentMember",
          isExtension: true,
        },
        { label: "Gaming", amount: "$10.4B", sourceTag: "GamingSegmentMember", isExtension: true },
        {
          label: "Total segment revenue",
          amount: "$60.9B",
          sourceTag: "RevenueFromContractWithCustomerExcludingAssessedTax",
        },
      ]}
    />
  );
}

/**
 * An absent line renders the drained token, never a zero — a zero would be a
 * factual claim the filing did not make.
 */
export function WithAbsentLine() {
  return (
    <StatementTable
      labelHeader="Line item"
      amountHeader="FY2024 (USD)"
      caption="Lines the filer did not tag are shown drained, not as zero."
      rows={[
        { label: "Total revenue", amount: "$24.9B", sourceTag: "Revenues" },
        { label: "Operating income", amount: "$3.1B", sourceTag: "OperatingIncomeLoss" },
        { label: "Research and development", amount: "N/A", drained: true },
        { label: "Net income", amount: "$2.4B", sourceTag: "NetIncomeLoss" },
      ]}
    />
  );
}
