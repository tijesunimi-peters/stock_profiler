import type { ReactNode } from "react";

export interface ViewRailItem {
  /** Stable key, also the URL path segment, e.g. `statements`. */
  value: string;
  label: string;
}

export interface ViewRailSection {
  /** Mono ordinal shown in the gutter, e.g. `03`. Must match the `SectionHead` it addresses. */
  n: string;
  label: string;
  /** In-page anchor, e.g. `#s3`. */
  href: string;
  /** Marks the section currently in view. */
  current?: boolean;
}

export interface ViewRailProps {
  views: ViewRailItem[];
  /** The active view's `value`. */
  active: string;
  onChange?: (value: string) => void;
  /** Rail heading. `Views` unless the rail addresses something else. */
  label?: string;
  /**
   * A jump list for the sections of the ACTIVE view, under its own heading.
   *
   * Long views earn one: five numbered sections down a 4,000px page are not navigable by
   * scrolling alone. The ordinals are the same ones the section headers carry, which is why
   * those numbers have to stay stable.
   */
  sections?: ViewRailSection[];
  /** Heading over the section list. */
  sectionsLabel?: string;
  /** A mono note pinned under the rail — usually what the whole view is scoped to. */
  note?: string;
  /** Rail width in px. Wider views (six-item rails) need more than the 178px default. */
  width?: number;
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
export function ViewRail({
  views,
  active,
  onChange,
  label = "Views",
  sections,
  sectionsLabel = "Sections",
  note,
  width,
  children,
  className,
}: ViewRailProps) {
  return (
    <div className={["shell-body", className].filter(Boolean).join(" ")}>
      <nav
        className="shell-rail"
        aria-label={label}
        style={width ? { width: `${width}px` } : undefined}
      >
        <div className="shell-rail-label">{label}</div>
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

        {sections?.length ? (
          <>
            <div className="shell-rail-rule" />
            <div className="shell-rail-label">{sectionsLabel}</div>
            <div className="shell-rail-sections">
              {sections.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  className={["shell-rail-sec", s.current ? "active" : null]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="shell-rail-sec-n">{s.n}</span>
                  <span>{s.label}</span>
                </a>
              ))}
            </div>
          </>
        ) : null}

        {note ? (
          <>
            <div className="shell-rail-rule" />
            <div className="shell-rail-note">{note}</div>
          </>
        ) : null}
      </nav>
      <div className="shell-viewport">{children}</div>
    </div>
  );
}
