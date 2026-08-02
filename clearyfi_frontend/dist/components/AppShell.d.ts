import type { ReactNode } from "react";
export interface ShellSubject {
    /** Subject name, e.g. `Companies`. */
    label: string;
    /**
     * Destination. **Omit for a planned-and-inert subject** — that renders a `<span>` with no
     * href and no handler, which is the honest way to name something not yet built
     * (STYLE_GUIDE §10.1). A dead `href="#"` is the forbidden version.
     */
    href?: string;
    /** Marks the active subject. */
    current?: boolean;
    /** What the subject will hold. Shown on hover for planned subjects. */
    title?: string;
}
export interface AppShellProps {
    /** Page content — usually a `Masthead` followed by sections. */
    children: ReactNode;
    /** Subject nav. Defaults to the product's seven subjects, three live and four planned. */
    subjects?: ShellSubject[];
    /** Subject-scoped actions (Compare · Screen · Coverage). */
    actions?: ShellSubject[];
    /** Placeholder for the global ticker/CIK search. */
    searchPlaceholder?: string;
    className?: string;
}
/**
 * The one product shell every data page lives in (STYLE_GUIDE §4.2, §5): a fixed subject
 * sidebar and a sticky topbar carrying the global search.
 *
 * The sidebar names **the entity you are analysing** — the claim that the product is
 * entity-centric rather than report-centric. There is exactly one shell; do not build a second
 * nav for a new page.
 */
export declare function AppShell({ children, subjects, actions, searchPlaceholder, className, }: AppShellProps): import("react").JSX.Element;
