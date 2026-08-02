import { Fragment } from "react";
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
  /**
   * A small colour chip before the value — used where the entity has a CATEGORY (a 13F filer's
   * classification). Categorical identity only; never a rating.
   */
  swatch?: string;
}

export interface EntityBarProps {
  cells: EntityCell[];
  /** A trailing mono note, right-aligned — the standing caveat about what these values are. */
  note?: string;
  /** A second row under a hairline, for a control that changes the focal entity. */
  footer?: import("react").ReactNode;
  className?: string;
}

/**
 * The control bar for a page with a single focal entity — company, manager, sector.
 *
 * Its job is to answer "what am I looking at, and how old is it?" before the reader scrolls.
 * An unresolved cell renders a drained `—`; that is deliberate, and it is why this component
 * takes `null` rather than making the caller decide what to substitute.
 */
export function EntityBar({ cells, note, footer, className }: EntityBarProps) {
  return (
    <div className={["shell-entity", className].filter(Boolean).join(" ")}>
      <div className="shell-entity-row">
        {cells.map((cell, i) => (
          <Fragment key={`${cell.label}-${i}`}>
            {/* Hairline between cells — these are separate facts about one entity, not a
                sentence. Without it the bar reads as run-on. */}
            {i > 0 ? <div className="shell-entity-sep" /> : null}
            <div className="shell-entity-cell">
              <div className="shell-entity-label">{cell.label}</div>
              <div
                className={[
                  "shell-entity-value",
                  cell.primary ? "is-primary" : null,
                  cell.mono && !cell.primary ? "is-mono" : null,
                  cell.value === null ? "is-pending" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {cell.swatch ? (
                  <span className="shell-entity-swatch" style={{ background: cell.swatch }} />
                ) : null}
                {cell.value ?? "—"}
              </div>
            </div>
          </Fragment>
        ))}
        {note ? (
          <>
            <div className="shell-entity-spacer" />
            <span className="shell-entity-note">{note}</span>
          </>
        ) : null}
      </div>
      {footer ? <div className="shell-entity-foot">{footer}</div> : null}
    </div>
  );
}
