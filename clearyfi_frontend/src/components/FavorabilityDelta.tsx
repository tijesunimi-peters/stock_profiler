export interface FavorabilityDeltaProps {
  /**
   * Direction of travel. Drives the glyph (▲ / ▬ / ▼) and the muted earthy tint.
   * This describes **direction**, never a good/bad verdict on the company or sector.
   */
  direction: "up" | "flat" | "down";
  /** The change itself, pre-formatted, e.g. `+4.2` or `−1.8`. Always shown — never a bare arrow. */
  value: string;
  /** Optional trailing context, e.g. `vs prior quarter`. */
  context?: string;
  className?: string;
}

const GLYPH = { up: "▲", flat: "▬", down: "▼" } as const;
const CLS = { up: "pos", flat: "flat", down: "neg" } as const;

/**
 * The scoped favorability chip for a sector score's direction (STYLE_GUIDE §1).
 *
 * This is the **one sanctioned exception** to "terracotta is the only chromatic accent", and it
 * comes with three rules that are not negotiable:
 *
 * 1. Only for favorability of direction on a sector score — **not** a general good/bad palette.
 * 2. Always paired with a **glyph** and a **number**, so meaning never rests on color alone.
 * 3. The underlying score is a **position relative to other sectors**, not a verdict and never
 *    a buy/sell signal.
 *
 * The palette is a muted moss/amber/brick trio precisely so it does not read as a green-red
 * stoplight. Do not swap in saturated colors.
 */
export function FavorabilityDelta({
  direction,
  value,
  context,
  className,
}: FavorabilityDeltaProps) {
  return (
    <span
      className={["pa-tile-delta", CLS[direction], className].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true">{GLYPH[direction]}</span>
      <span>{value}</span>
      {context ? <span style={{ color: "var(--mono-muted)" }}>{context}</span> : null}
    </span>
  );
}
