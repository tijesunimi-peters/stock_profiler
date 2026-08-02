import { FavorabilityDelta } from "./FavorabilityDelta.js";

export interface SectorScoreTileProps {
  /** Sector name, e.g. `Semiconductors & related devices`. */
  sector: string;
  /**
   * Composite theme score, 0–100. This is a **position relative to other sectors** — not a
   * grade, not a verdict, and never a buy signal.
   */
  score: number;
  /** Direction of travel since the prior period. */
  direction?: "up" | "flat" | "down";
  /** The change, pre-formatted, e.g. `+4.2`. */
  delta?: string;
  /** What the score is composed of, e.g. `Profitability`. */
  theme?: string;
  /** Number of filers behind the score — coverage is part of the reading. */
  coverage?: string;
  className?: string;
}

/**
 * A sector's composite theme score (sector overview scorecard).
 *
 * The score number itself stays **neutral ink** with a dashed cue — it is deliberately not
 * given a saturated fill, because a colored 82 reads as "good" and the number does not mean
 * that. Only the *direction* chip carries the favorability tint, and only alongside a glyph
 * and a figure (STYLE_GUIDE §1).
 */
export function SectorScoreTile({
  sector,
  score,
  direction,
  delta,
  theme,
  coverage,
  className,
}: SectorScoreTileProps) {
  return (
    <div className={["pa-tile", className].filter(Boolean).join(" ")}>
      <div className="pa-tile-name">{sector}</div>
      <div className="pa-tile-scorerow">
        <span className="pa-tile-score has-cue">{score}</span>
        {direction && delta ? <FavorabilityDelta direction={direction} value={delta} /> : null}
      </div>
      <div className="mtile-foot">
        {theme ? <span>{theme}</span> : null}
        {coverage ? <span>{coverage}</span> : null}
      </div>
    </div>
  );
}
