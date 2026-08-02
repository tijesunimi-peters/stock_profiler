export interface DisclosureProps {
    /** The coverage/caveat lines. One per limit — do not merge them into a paragraph. */
    items: string[];
    /** Summary label. */
    label?: string;
    open?: boolean;
    className?: string;
}
/** The standing caveats every data page carries. Use these verbatim unless the view narrows them. */
export declare const STANDARD_DISCLOSURES: {
    readonly financials_floor: "XBRL financial data begins around 2009–2012 depending on filer size. An empty period means we have no structured data for it, not that nothing was filed.";
    readonly institutional_13f: "13F reports quarter-end long positions only — no shorts, no derivatives — and is filed up to 45 days after quarter end. Any buy/sell is DERIVED by diffing consecutive quarters, never a reported trade.";
    readonly ownership_13dg_floor: "Schedule 13D/13G is only available as structured XML from around mid-2025; earlier filings are not covered.";
    readonly not_advice: "This is public SEC filing data, cleaned and re-shaped. It is not investment advice, and nothing here is a recommendation.";
};
/**
 * The dashed data-notes block that carries coverage limits and the not-advice line
 * (STYLE_GUIDE §9.6, §9.8).
 *
 * Every data page ends with one. The point is that a reader can tell the difference between
 * "we have nothing" and "nothing exists" — which is exactly the distinction a silent empty
 * state destroys. `STANDARD_DISCLOSURES` holds the canonical strings.
 */
export declare function Disclosure({ items, label, open, className, }: DisclosureProps): import("react").JSX.Element;
