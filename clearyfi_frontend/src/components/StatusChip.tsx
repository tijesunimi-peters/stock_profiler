import type { MetricStatus } from "../types.js";
import { STATUS_META } from "../types.js";

export interface StatusChipProps {
  /** Which of the four statuses this value carries. */
  status: MetricStatus;
  /** Hide the text tag and show only the glyph. Use sparingly — the label is half the signal. */
  glyphOnly?: boolean;
  className?: string;
}

/**
 * The status marker that rides alongside every metric and derived value (STYLE_GUIDE §7).
 *
 * Distinguished by **glyph + label + border style**, never by color alone — the accent and the
 * flag color are both warm, so color-only status would be unreadable as well as inaccessible.
 * Solid border = `na` (hard structural), dashed = `nm` (soft judgment); keep that distinction.
 */
export function StatusChip({ status, glyphOnly = false, className }: StatusChipProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={["chip", meta.className, className].filter(Boolean).join(" ")}
      title={meta.description}
    >
      <span className="glyph" aria-hidden="true">
        {meta.glyph}
      </span>
      {glyphOnly ? <span className="sr-only">{meta.tag}</span> : meta.tag}
    </span>
  );
}
