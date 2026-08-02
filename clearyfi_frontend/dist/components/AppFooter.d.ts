export interface FooterLink {
    label: string;
    /** Must resolve to a real route. */
    href: string;
}
export interface AppFooterProps {
    links?: FooterLink[];
    /** Muted right-aligned tagline. */
    tagline?: string;
    className?: string;
}
/**
 * The page footer: a thin rule, mono accent links to real routes, and the standing tagline.
 *
 * Every link resolves — placeholder hrefs are forbidden (STYLE_GUIDE §10).
 */
export declare function AppFooter({ links, tagline, className, }: AppFooterProps): import("react").JSX.Element;
