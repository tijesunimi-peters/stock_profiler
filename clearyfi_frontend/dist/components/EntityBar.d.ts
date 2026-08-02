export interface EntityCell {
    /** Mono uppercase label, e.g. `CIK` or `Latest filing`. */
    label: string;
    /**
     * The value. Pass `null` for something that has not resolved yet — the cell renders drained
     * rather than showing `0` or a guess. A value we can **never** source should be omitted
     * entirely rather than shown as a permanent N/A (STYLE_GUIDE §5).
     */
    value: string | null;
    /** Render in mono — use for identifiers, dates and figures. */
    mono?: boolean;
    /** The focal identity (ticker / manager name), rendered larger. */
    primary?: boolean;
}
export interface EntityBarProps {
    cells: EntityCell[];
    className?: string;
}
/**
 * The control bar for a page with a single focal entity — company, manager, sector.
 *
 * Its job is to answer "what am I looking at, and how old is it?" before the reader scrolls.
 * An unresolved cell renders a drained `—`; that is deliberate, and it is why this component
 * takes `null` rather than making the caller decide what to substitute.
 */
export declare function EntityBar({ cells, className }: EntityBarProps): import("react").JSX.Element;
