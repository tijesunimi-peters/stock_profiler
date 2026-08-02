/**
 * The chart kernel.
 *
 * One wrapper owns an `<svg>` and calls `draw(sel, ctx)`. React never reconciles the marks, so
 * keyed d3 joins can transition them when the range, metric, focal company or register changes.
 *
 * Three rules the whole port depends on (RECONCILIATION §5) — all three were bugs before they
 * were rules:
 *
 *  1. Entering marks get their FINAL geometry on enter; only updates animate. Otherwise every
 *     newly-mounted chart flies in from the origin.
 *  2. When the page is hidden, draw unanimated and call `d3.timerFlush()`. A throttled frame
 *     loop never ticks a transition, so marks would sit at their enter state — empty bars, dots
 *     at x=0 — until the tab regained focus.
 *  3. Fluid charts MEASURE their container and use the real pixel width as the viewBox width.
 *     `preserveAspectRatio:none` on a fixed viewBox stretches circles into ellipses.
 */
import * as d3 from "d3";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type D3 = typeof d3;

export interface DrawCtx<T> {
  d3: D3;
  /** True when the draw must not animate (hidden tab, or first paint). */
  still: boolean;
  width: number;
  height: number;
  data: T;
  /** The positioned wrapper — where a hover readout box is allowed to sit outside the SVG. */
  container: HTMLElement | null;
}

export type DrawFn<T> = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  ctx: DrawCtx<T>,
) => void;

/** Transition timing used everywhere (README "Interactions & behavior"). */
export const DUR = 480;
export const EASE = d3.easeCubicOut;

/** Measured line boxes in viewBox units (RECONCILIATION §6.2). Fallbacks only — prefer DOM. */
export const LINE_MONO = 14.2;
export const LINE_SANS = 17.4;
export const ROW = 16;
export const ROW_NAME = 19;

/**
 * A transition that respects rule 2. Use for UPDATES only — entering marks are placed directly.
 */
// Returns `any` on purpose: the Selection/Transition union has incompatible `attr` overloads,
// and every call site here only chains attr/style, which both support identically.
export function anim<E extends d3.BaseType, D>(
  sel: d3.Selection<E, D, any, any>,
  still: boolean,
  dur = DUR,
): any {
  return still ? sel : sel.transition().duration(dur).ease(EASE);
}

/** Flush pending timers after a still draw so nothing is stranded at its enter state. */
export function settle(still: boolean): void {
  if (still) d3.timerFlush();
}

/**
 * Real text measurement (RECONCILIATION §6.1) — strictly better than the per-character width
 * constants the prototype had to use. Returns 0 for an unrendered node, so callers should fall
 * back to `LINE_*` when the result is 0.
 */
export function textWidth(node: SVGTextElement | null): number {
  if (!node || typeof node.getComputedTextLength !== "function") return 0;
  try {
    return node.getComputedTextLength();
  } catch {
    return 0;
  }
}

/**
 * Edge anchoring, not width arithmetic. A centred label that would cross the canvas edge
 * switches its anchor and pins to the edge (RECONCILIATION §6.1).
 */
export function edgeAnchor(x: number, width: number): "start" | "middle" | "end" {
  if (x < width * 0.08) return "start";
  if (x > width * 0.92) return "end";
  return "middle";
}

export function clampX(x: number, width: number, pad = 2): number {
  return Math.max(pad, Math.min(width - pad, x));
}

/**
 * Candidate-offset placement for scatter labels (RECONCILIATION §6.3): try right/left ×
 * baseline/above/below and take the first that clears every box already placed. Returns null
 * when nothing fits — the caller must then drop the label and leave the value on `<title>`,
 * never overlap.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function placeLabel(
  cx: number,
  cy: number,
  w: number,
  h: number,
  placed: Box[],
  bounds: { width: number; height: number },
): { x: number; y: number; anchor: "start" | "end"; box: Box } | null {
  const gap = 5;
  const candidates: { x: number; y: number; anchor: "start" | "end" }[] = [
    { x: cx + gap, y: cy + h * 0.32, anchor: "start" },
    { x: cx - gap, y: cy + h * 0.32, anchor: "end" },
    { x: cx + gap, y: cy - gap, anchor: "start" },
    { x: cx - gap, y: cy - gap, anchor: "end" },
    { x: cx + gap, y: cy + h + gap * 0.4, anchor: "start" },
    { x: cx - gap, y: cy + h + gap * 0.4, anchor: "end" },
  ];
  for (const c of candidates) {
    const box: Box = { x: c.anchor === "start" ? c.x : c.x - w, y: c.y - h, w, h };
    if (box.x < 0 || box.x + box.w > bounds.width) continue;
    if (box.y < 0 || box.y + box.h > bounds.height) continue;
    if (placed.some((p) => !(box.x + box.w < p.x || p.x + p.w < box.x || box.y + box.h < p.y || p.y + p.h < box.y)))
      continue;
    return { ...c, box };
  }
  return null;
}

/** Apply the mono micro-label treatment to a selection. */
export function mono<E extends d3.BaseType, D>(
  sel: d3.Selection<E, D, any, any>,
  size = 9.5,
): d3.Selection<E, D, any, any> {
  return sel
    .style("font-family", "var(--font-mono)")
    .style("font-size", `${size}px`)
    .style("letter-spacing", "0.08em")
    .style("text-transform", "uppercase")
    .style("fill", "var(--mono-muted)");
}

/** Apply the sans value treatment. */
export function sans<E extends d3.BaseType, D>(
  sel: d3.Selection<E, D, any, any>,
  size = 11.5,
  weight = 500,
): d3.Selection<E, D, any, any> {
  return sel
    .style("font-family", "var(--font-sans)")
    .style("font-size", `${size}px`)
    .style("font-weight", String(weight))
    .style("fill", "var(--ink-body)");
}

/** Gridlines from a negative tickSize, hairline, no domain path. */
export function gridStyle(g: d3.Selection<any, unknown, null, undefined>): void {
  g.select(".domain").remove();
  g.selectAll(".tick line").style("stroke", "var(--border)").style("stroke-width", 1);
  mono(g.selectAll(".tick text") as any, 9);
}

/**
 * The shared hover readout — one boxed mono stack, reused by every chart so a reading never
 * looks like a foreign widget. On short strips the box is allowed outside the SVG.
 */
export function makeReadout(container: HTMLElement): {
  show: (x: number, y: number, lines: string[]) => void;
  hide: () => void;
  destroy: () => void;
} {
  /*
   * Idempotent per container.
   *
   * Callers were each expected to clear the previous readout before re-rendering, and four of the
   * twelve did not — so every re-render leaked a hidden div. A manager footprint with four charts
   * was carrying twenty-one of them. Invisible (they are `display: none` until hovered) and
   * unbounded, which is the worst combination: nothing looks wrong while the DOM grows.
   *
   * Putting it here rather than adding a fifth copy of the cleanup line makes it structural — a
   * new chart cannot forget.
   */
  container.querySelectorAll(":scope > .chart-readout").forEach((n) => n.remove());

  const el = document.createElement("div");
  el.className = "chart-readout";
  el.setAttribute("aria-hidden", "true");
  container.appendChild(el);
  return {
    show(x, y, lines) {
      el.innerHTML = lines
        .map((l, i) => `<div class="chart-readout-line${i === 0 ? " is-head" : ""}">${l}</div>`)
        .join("");
      el.style.display = "block";
      const box = el.getBoundingClientRect();
      const cw = container.clientWidth;
      const left = Math.max(2, Math.min(cw - box.width - 2, x - box.width / 2));
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(-box.height - 4, y - box.height - 10)}px`;
    },
    hide() {
      el.style.display = "none";
    },
    destroy() {
      el.remove();
    },
  };
}

/**
 * Attach the shared hover readout to a selection of marks.
 *
 * Every chart reads into ONE boxed mono stack, so a reading never looks like a foreign widget.
 * A native `<title>` is not a substitute: it waits about a second, renders in the OS font, and
 * cannot show more than one line — the readout is the interaction, the title is the fallback.
 */
export function attachReadout<E extends d3.BaseType, D>(
  sel: d3.Selection<E, D, any, any>,
  container: HTMLElement | null,
  lines: (d: D) => string[],
): void {
  if (!container) return;
  const readout = makeReadout(container);
  readout.hide();
  sel
    .style("cursor", "default")
    .on("mousemove", function (event: any, d: any) {
      const [px, py] = d3.pointer(event, container as any);
      readout.show(px, py, lines(d));
    })
    .on("mouseleave", () => readout.hide());
}

/**
 * Container width via `ResizeObserver` (rule 3). Returns the fallback until the first
 * measurement lands, so a chart never authors itself below its container width.
 */
export function useMeasuredWidth(fallback = 640): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const next = Math.round(node.clientWidth);
      if (next > 0) setW(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** True while the document is hidden — chart draws must then be unanimated (rule 2). */
export function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return hidden;
}

/**
 * Mount a d3 drawing into an svg the framework will not touch.
 *
 * `first` forces a still draw on the initial paint so entering marks land at final geometry
 * (rule 1) even when the tab is visible.
 */
export function useChart<T>(draw: DrawFn<T>, data: T, height: number, fallbackWidth = 640) {
  const [wrapRef, width] = useMeasuredWidth(fallbackWidth);
  const svgRef = useRef<SVGSVGElement>(null);
  const hidden = usePageHidden();
  const drawnOnce = useRef(false);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const node = svgRef.current;
    if (!node || width <= 0) return;
    const still = hidden || !drawnOnce.current;
    const svg = d3.select(node);
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    drawRef.current(svg as any, { d3, still, width, height, data, container: wrapRef.current });
    settle(still);
    drawnOnce.current = true;
  }, [data, width, height, hidden]);

  return { wrapRef, svgRef, width, height };
}
