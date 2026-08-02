export interface SourceBadgeProps {
  /**
   * `gaap` for a standard US-GAAP tag; `ext` for a company **extension** tag, which is the
   * filer's own invention and therefore less comparable across companies.
   */
  kind: "gaap" | "ext";
  /** The source tag itself, e.g. `Revenues` or `AppleSegmentRevenue`. Defaults to the kind. */
  label?: string;
  className?: string;
}

/**
 * The per-row audit badge that names where a number came from (STYLE_GUIDE §1, §6).
 *
 * Every canonical fact records its source tag and whether it was a company extension — this
 * badge is how that reaches the reader, and it is what makes a statement table auditable
 * rather than merely tidy.
 */
export function SourceBadge({ kind, label, className }: SourceBadgeProps) {
  const text = label ?? (kind === "gaap" ? "US-GAAP" : "EXT");
  return (
    <span
      className={["badge", kind === "gaap" ? "badge-gaap" : "badge-ext", className]
        .filter(Boolean)
        .join(" ")}
      title={kind === "gaap" ? "Standard US-GAAP tag" : "Company extension tag — less comparable"}
    >
      {text}
    </span>
  );
}
