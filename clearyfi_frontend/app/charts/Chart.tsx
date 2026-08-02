/**
 * The React wrapper every chart mounts through. It owns a positioned container (so a hover
 * readout may sit outside the SVG) and an `<svg>` that React never reconciles.
 */
import type { DrawFn } from "./kernel";
import { useChart } from "./kernel";

export interface ChartProps<T> {
  draw: DrawFn<T>;
  data: T;
  height: number;
  /** Only used before the first measurement lands; the real width always wins. */
  fallbackWidth?: number;
  className?: string;
  /** Accessible description — a chart is not decorative. */
  label?: string;
}

export function Chart<T>({ draw, data, height, fallbackWidth, className, label }: ChartProps<T>) {
  const { wrapRef, svgRef } = useChart(draw, data, height, fallbackWidth);
  return (
    <div className={["chart-wrap", className].filter(Boolean).join(" ")} ref={wrapRef}>
      <svg ref={svgRef} role="img" aria-label={label} />
    </div>
  );
}
