import type { MetricValue } from "../types.js";
export interface MetricCardProps {
    /** The metric, including its status, basis and reason. */
    metric: MetricValue;
    /** Plain-language formula shown under "Show your work". */
    formula?: string;
    /** Open the provenance disclosure on first render. */
    provenanceOpen?: boolean;
    className?: string;
}
/**
 * The primary metric surface (STYLE_GUIDE §6): name + status chip, big mono value with its
 * basis tag, an optional caveat note, and built-in provenance.
 *
 * An `na`/`nm` metric renders the **drained token** on tint with no shadow — visibly present,
 * visibly not a number. It is never rendered as `0`, blank, or a guess; that rule outranks
 * every aesthetic consideration in this system.
 */
export declare function MetricCard({ metric, formula, provenanceOpen, className }: MetricCardProps): import("react").JSX.Element;
