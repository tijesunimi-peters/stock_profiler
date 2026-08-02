export interface TickerChipProps {
    /** The ticker symbol. Rendered upper-case. */
    symbol: string;
    className?: string;
}
/**
 * The company identity token — mono, ink fill, paper text (STYLE_GUIDE §6).
 *
 * Use it wherever a company is named in a compact context: table rows, entity bars, search
 * results. It is the one place the ink color is used as a fill on a data page.
 */
export declare function TickerChip({ symbol, className }: TickerChipProps): import("react").JSX.Element;
