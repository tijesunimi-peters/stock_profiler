export interface RecoveryLink {
    label: string;
    /** Must resolve to a real route — placeholder links are forbidden (STYLE_GUIDE §10). */
    href: string;
}
export interface StateBlockProps {
    /**
     * `loading` — pulsing accent dot + shimmer, with a note when the path may be cold.
     * `empty` — a filing is on record but nothing mapped; **not** the same as "nothing filed".
     * `notFound` — mono HTTP code in the flag color, plus recovery chips.
     * `error` — the request failed.
     */
    variant: "loading" | "empty" | "notFound" | "error";
    /** Overrides the default title for the variant. */
    title?: string;
    /** Body copy. Say what the reader can do next. */
    copy?: string;
    /** Offered on `notFound` — give the reader somewhere real to go. */
    recovery?: RecoveryLink[];
    /** Shown under a `loading` state when the first request may be slow. */
    coldNote?: string;
    className?: string;
}
/**
 * The four shared non-data states (STYLE_GUIDE §6).
 *
 * The `empty` copy matters more than it looks: **empty is not "nothing was filed"**. Coverage
 * has real floors (XBRL from ~2009–2012, 13D/G structured XML from ~mid-2025), and a state
 * that silently implies absence of filings rather than absence of coverage is a lie by layout.
 */
export declare function StateBlock({ variant, title, copy, recovery, coldNote, className, }: StateBlockProps): import("react").JSX.Element;
