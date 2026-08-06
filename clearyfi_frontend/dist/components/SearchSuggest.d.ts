export interface Suggestion {
    ticker: string;
    cik: number;
    name?: string | null;
}
export interface SearchSuggestProps {
    placeholder?: string;
    /**
     * Resolves a query to suggestions. The component never fetches — it does not know the API
     * exists, which is what lets the design system stay presentational and the app own the seam.
     */
    onSearch: (query: string) => Promise<Suggestion[]>;
    /** A row was chosen, by click or by Enter on the highlighted row. */
    onPick: (s: Suggestion) => void;
    /** Debounce before a query is issued. 150ms is the static UI's value. */
    debounceMs?: number;
    /** Binds ⌘K / Ctrl-K to focus the input. */
    hotkey?: boolean;
}
/**
 * The global ticker/CIK typeahead, ported from the static UI's `suggest.js`.
 *
 * Four behaviours in the original are load-bearing and survive the port:
 *
 *  - **A sequence guard, not just a debounce.** Responses can land out of order, so a reply is
 *    dropped unless it belongs to the most recent request. Without it a slow "a" overwrites a
 *    fast "aapl".
 *  - **`mousedown`, not `click`.** The input's blur fires first and would tear the menu down
 *    before a click ever resolved.
 *  - **Blur closes on a delay**, so a pick in flight still completes.
 *  - **Escape closes the menu without clearing the input** — it dismisses the suggestion, not
 *    the thing you typed.
 */
export declare function SearchSuggest({ placeholder, onSearch, onPick, debounceMs, hotkey, }: SearchSuggestProps): import("react").JSX.Element;
