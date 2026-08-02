import type { ReactNode } from "react";

export interface ViewRailItem {
  /** Stable key, also the URL path segment, e.g. `statements`. */
  value: string;
  label: string;
}

export interface ViewRailProps {
  views: ViewRailItem[];
  /** The active view's `value`. */
  active: string;
  onChange?: (value: string) => void;
  /** The view's content. */
  children: ReactNode;
  className?: string;
}

/**
 * The vertical view rail plus its viewport — used by any page with two or more views
 * (STYLE_GUIDE §5).
 *
 * A view is a **path segment** (`/company/AAPL/statements`), not a client-side tab, so Back
 * and Forward walk views the way a reader expects. One-view pages get no rail.
 */
export function ViewRail({ views, active, onChange, children, className }: ViewRailProps) {
  return (
    <div className={["shell-body", className].filter(Boolean).join(" ")}>
      <nav className="shell-rail" aria-label="Views">
        <div className="shell-rail-label">Views</div>
        {views.map((v) => (
          <button
            key={v.value}
            type="button"
            className={["shell-rail-btn", v.value === active ? "active" : null]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange?.(v.value)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="shell-viewport">{children}</div>
    </div>
  );
}
