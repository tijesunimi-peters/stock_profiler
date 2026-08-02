import type { ReactNode } from "react";
export interface ButtonProps {
    children: ReactNode;
    /**
     * `primary` — terracotta fill, the one call to action.
     * `outline` — hairline border on paper, for secondary actions.
     * `inverse` — ink fill with a mono uppercase label; the data-page action button.
     */
    variant?: "primary" | "outline" | "inverse";
    /** Render as a link. Every href must resolve to a real route — never a placeholder. */
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}
/**
 * The action control, in the three shipped treatments (STYLE_GUIDE §4.6–4.7).
 *
 * Terracotta is the only chromatic accent for interactive elements — do not introduce a second
 * accent hue for a different action, and never use the favorability trio here.
 */
export declare function Button({ children, variant, href, onClick, disabled, className, }: ButtonProps): import("react").JSX.Element;
