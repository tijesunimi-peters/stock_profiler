/**
 * Distribution strips — the chart that recurs most in the app.
 *
 * One `stripDraw` serves every call site (RECONCILIATION §5c: `dotPlot` + `peerDots` +
 * `universeDots` + `track` were consolidated in the prototype and must stay consolidated).
 * A strip with no dots is the sector-altitude "track"; a strip with dots and a focal mark is
 * the company-altitude peer cloud. Same routine, different inputs.
 *
 * Honesty properties, all load-bearing:
 *   - peers with no comparable value are EXCLUDED and COUNTED, never plotted at zero;
 *   - every dot takes the same fill — the focal filer is distinguished by shape and size, not
 *     by being the only colored mark (a colored dot reads as a verdict);
 *   - a single comparable filer draws no median and no middle-half band, and says so.
 *
 * It is also a CONTROL: clicking a dot changes the focal company (README "Interactions").
 */
import { useMemo } from "react";
import { Chart } from "./Chart";
import { anim, clampX, edgeAnchor, makeReadout, mono, type DrawFn } from "./kernel";

export interface StripDatum {
  id: string;
  label: string;
  value: number | null;
}

export interface StripMark {
  id: string;
  label: string;
  value: number;
  /** `focal` is a terracotta diamond; `a`/`b` are the categorical compare identities. */
  kind: "focal" | "a" | "b";
}

export interface StripQuantiles {
  lo: number;
  hi: number;
  q1: number;
  q3: number;
  med: number;
}

export interface StripData {
  peers: StripDatum[];
  marks: StripMark[];
  format: (v: number) => string;
  onPick?: (id: string) => void;
  axisLabels: boolean;
  /** Explicit domain, when several strips must share one axis. */
  domain?: [number, number];
  /**
   * Pre-computed quantiles, for a strip that has a distribution but no per-filer dots — the
   * sector altitude, where the band IS the message and no single filer is focal.
   */
  quantiles?: StripQuantiles;
  /** Jitter lanes for the dot cloud. */
  lanes: number;
  laneGap: number;
  bandH: number;
  medColor: string;
}

const PAD = 10;

const stripDraw: DrawFn<StripData> = (svg, { d3, still, width, height, data, container }) => {
  const { peers, marks, format, onPick, axisLabels } = data;
  const vals = peers.map((p) => p.value).filter((v): v is number => v != null);
  const excluded = peers.length - vals.length;

  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());

  const bandTop = 6;
  const bandH = data.bandH;
  const axisY = bandTop + bandH + 12;

  if (!vals.length && !marks.length && !data.quantiles) {
    mono(svg.append("text").attr("x", 0).attr("y", 16).text("no comparable value in this peer set"));
    return;
  }

  const sorted = [...vals].sort((a, b) => a - b);
  const qf = (p: number) => {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * p;
    const l = Math.floor(i);
    const h = Math.ceil(i);
    return l === h ? sorted[l] : sorted[l] + (sorted[h] - sorted[l]) * (i - l);
  };
  const Q = data.quantiles ?? {
    lo: sorted[0],
    hi: sorted[sorted.length - 1],
    q1: qf(0.25),
    q3: qf(0.75),
    med: qf(0.5),
  };

  const markVals = marks.map((m) => m.value);
  const lo = data.domain ? data.domain[0] : Math.min(Q.lo, ...markVals);
  const hi = data.domain ? data.domain[1] : Math.max(Q.hi, ...markVals);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;

  const x = d3
    .scaleLinear()
    .domain([lo - pad, hi + pad])
    .range([PAD, width - PAD])
    .clamp(true);

  // A distribution of one is not a distribution — no band, no median rule, and say so.
  const distributional = !!data.quantiles || sorted.length >= 2;

  svg
    .append("line")
    .attr("x1", PAD)
    .attr("x2", width - PAD)
    .attr("y1", bandTop + bandH / 2)
    .attr("y2", bandTop + bandH / 2)
    .style("stroke", "var(--border-strong)")
    .style("stroke-width", 1);

  if (distributional) {
    svg
      .append("rect")
      .attr("y", bandTop)
      .attr("height", bandH)
      .attr("rx", 3)
      .attr("x", x(Q.q1))
      .attr("width", Math.max(2, x(Q.q3) - x(Q.q1)))
      .style("fill", "var(--accent-wash)")
      .style("stroke", "var(--accent-wash-border)");

    svg
      .append("line")
      .attr("x1", x(Q.med))
      .attr("x2", x(Q.med))
      .attr("y1", bandTop - 3)
      .attr("y2", bandTop + bandH + 3)
      .style("stroke", data.medColor)
      .style("stroke-width", 1.5);
  }

  // Peer cloud. Index jitter keeps overlapping values readable without moving them on the axis.
  const dots = svg
    .append("g")
    .selectAll<SVGCircleElement, StripDatum>("circle")
    .data(
      peers.filter((p) => p.value != null),
      (d) => d.id,
    )
    .join(
      (enter) =>
        enter
          .append("circle")
          // Rule 1: entering marks land at final geometry.
          .attr("cx", (d) => x(d.value as number))
          .attr(
            "cy",
            (_d, i) => bandTop + bandH / 2 + ((i % data.lanes) - (data.lanes - 1) / 2) * data.laneGap,
          )
          .attr("r", 3.1),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("class", "dist-strip-dot")
    .style("fill", "var(--ink-soft)")
    .style("fill-opacity", 0.5)
    .style("cursor", onPick ? "pointer" : "default");

  anim(dots, still)
    .attr("cx", (d: StripDatum) => x(d.value as number))
    .attr(
      "cy",
      (_d: StripDatum, i: number) =>
        bandTop + bandH / 2 + ((i % data.lanes) - (data.lanes - 1) / 2) * data.laneGap,
    );

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  dots
    .on("mouseenter", function (event, d) {
      d3.select(this).style("fill-opacity", 0.95).attr("r", 4.2);
      const [px] = d3.pointer(event, container as any);
      readout?.show(px, bandTop + bandH / 2, [d.label, format(d.value as number)]);
    })
    .on("mouseleave", function () {
      d3.select(this).style("fill-opacity", 0.5).attr("r", 3.1);
      readout?.hide();
    })
    .on("click", (_e, d) => onPick?.(d.id));

  dots.append("title").text((d) => `${d.label} — ${format(d.value as number)}`);

  // Focal / A / B marks. Shape and size carry the identity, not a unique color.
  const markG = svg
    .append("g")
    .selectAll<SVGGElement, StripMark>("g")
    .data(marks, (d) => d.id)
    .join("g")
    .attr("transform", (d) => `translate(${x(d.value)},${bandTop + bandH / 2})`);

  markG
    .append("path")
    .attr(
      "d",
      d3
        .symbol()
        .type(d3.symbolDiamond)
        .size(90) as any,
    )
    .style("fill", (d) => (d.kind === "b" ? "var(--gaap-color)" : "var(--accent)"))
    .style("stroke", "var(--bg-card)")
    .style("stroke-width", 1.5);

  anim(markG, still).attr(
    "transform",
    (d: StripMark) => `translate(${x(d.value)},${bandTop + bandH / 2})`,
  );

  if (axisLabels) {
    const ticks: [number, string][] = distributional
      ? [
          [Q.lo, format(Q.lo)],
          [Q.med, format(Q.med)],
          [Q.hi, format(Q.hi)],
        ]
      : sorted.length === 1
        ? [[sorted[0], format(sorted[0])]]
        : [];
    const g = svg.append("g");
    for (const [v, text] of ticks) {
      const px = clampX(x(v), width);
      mono(g.append("text").attr("x", px).attr("y", axisY).attr("text-anchor", edgeAnchor(px, width)).text(text), 9);
    }
    const noteParts: string[] = [];
    if (!distributional && sorted.length === 1)
      noteParts.push("one comparable filer — no median, no middle half");
    if (excluded) noteParts.push(`${excluded} excluded (no comparable value)`);
    if (noteParts.length) {
      mono(
        svg
          .append("text")
          .attr("x", width - PAD)
          .attr("y", axisY + 12)
          .attr("text-anchor", "end")
          .text(noteParts.join(" · ")),
        8.5,
      );
    }
  }
};

export interface PeerStripProps {
  peers?: StripDatum[];
  marks?: StripMark[];
  /** Use instead of `peers` when the distribution is known but its members are not plotted. */
  quantiles?: StripQuantiles;
  format?: (v: number) => string;
  onPick?: (id: string) => void;
  axisLabels?: boolean;
  domain?: [number, number];
  height?: number;
  label?: string;
  /**
   * `track` is the sector-altitude strip: band + median, no dots, 34px tall.
   * `cloud` is the company-altitude strip: five jitter lanes of peer dots, 66px tall.
   * Both are the SAME routine — the difference is inputs, not a second chart.
   */
  variant?: "track" | "cloud";
}

const GEOM = {
  track: { height: 34, bandH: 14, lanes: 1, laneGap: 0, medColor: "var(--ink)" },
  cloud: { height: 66, bandH: 16, lanes: 5, laneGap: 8.6, medColor: "var(--mono-muted)" },
} as const;

export function PeerStrip({
  peers = [],
  marks = [],
  quantiles,
  format = (v) => String(Math.round(v * 100) / 100),
  onPick,
  axisLabels = true,
  domain,
  height,
  label,
  variant = "cloud",
}: PeerStripProps) {
  const g = GEOM[variant];
  const data = useMemo<StripData>(
    () => ({
      peers,
      marks,
      quantiles,
      format,
      onPick,
      axisLabels,
      domain,
      lanes: g.lanes,
      laneGap: g.laneGap,
      bandH: g.bandH,
      medColor: g.medColor,
    }),
    [peers, marks, quantiles, format, onPick, axisLabels, domain, g],
  );
  return (
    <Chart
      className="dist-strip"
      draw={stripDraw}
      data={data}
      height={height ?? g.height + (axisLabels ? 26 : 0)}
      label={label}
    />
  );
}

// ---------------------------------------------------------------------------- spread overlay

export interface SpreadBand {
  id: string;
  label: string;
  kind: "a" | "b";
  lo: number;
  q1: number;
  med: number;
  q3: number;
  hi: number;
}

/**
 * Two sectors' middle-half bands and medians on ONE shared axis.
 *
 * Overlaying rather than stacking is the point: the reader is comparing spread, and two
 * separate axes would let different scales masquerade as different dispersion. A/B color is
 * categorical identity — neither band is the winner.
 */
const spreadDraw: DrawFn<{ bands: SpreadBand[]; format: (v: number) => string }> = (
  svg,
  { d3, width, height, data },
) => {
  svg.selectAll("*").remove();
  if (!data.bands.length) return;
  const lo = Math.min(...data.bands.map((b) => b.lo));
  const hi = Math.max(...data.bands.map((b) => b.hi));
  const pad = (hi - lo || 1) * 0.08;
  const x = d3.scaleLinear().domain([lo - pad, hi + pad]).range([PAD, width - PAD]);

  data.bands.forEach((b, i) => {
    const y = 12 + i * 26;
    const fill = b.kind === "b" ? "var(--gaap-color)" : "var(--accent)";
    svg
      .append("line")
      .attr("x1", x(b.lo))
      .attr("x2", x(b.hi))
      .attr("y1", y)
      .attr("y2", y)
      .style("stroke", "var(--border-strong)");
    svg
      .append("rect")
      .attr("x", x(b.q1))
      .attr("width", Math.max(2, x(b.q3) - x(b.q1)))
      .attr("y", y - 8)
      .attr("height", 16)
      .attr("rx", 3)
      .style("fill", fill)
      .style("fill-opacity", 0.18)
      .style("stroke", fill)
      .style("stroke-opacity", 0.5);
    svg
      .append("line")
      .attr("x1", x(b.med))
      .attr("x2", x(b.med))
      .attr("y1", y - 11)
      .attr("y2", y + 11)
      .style("stroke", fill)
      .style("stroke-width", 2);
    mono(
      svg
        .append("text")
        .attr("x", clampX(x(b.med), width))
        .attr("y", y + 22)
        .attr("text-anchor", edgeAnchor(x(b.med), width))
        .text(`${b.label} ${data.format(b.med)}`),
      9,
    );
  });
};

export function SpreadOverlay({
  bands,
  format = (v) => String(Math.round(v * 10) / 10),
  label,
}: {
  bands: SpreadBand[];
  format?: (v: number) => string;
  label?: string;
}) {
  const data = useMemo(() => ({ bands, format }), [bands, format]);
  return <Chart draw={spreadDraw} data={data} height={bands.length * 26 + 28} label={label} />;
}

// ---------------------------------------------------------------------------- window strip

export interface WindowStripData {
  /** Statutory window length in days — 45 for 13F. */
  statutory: number;
  /** Filings placed inside the window: day offset from period end. */
  filings: { id: string; label: string; day: number }[];
}

/**
 * The statutory filing window, day 0 → day N, with the filing placed in it.
 *
 * A lag figure without its deadline is not interpretable (RECONCILIATION §4.5), which is why
 * this chart exists rather than a bare "filed 41 days after quarter end".
 */
const windowDraw: DrawFn<WindowStripData> = (svg, { d3, width, height, data }) => {
  svg.selectAll("*").remove();
  const pad = 12;
  const y = 22;
  const x = d3.scaleLinear().domain([0, data.statutory]).range([pad, width - pad]);

  svg
    .append("rect")
    .attr("x", pad)
    .attr("y", y - 7)
    .attr("width", width - pad * 2)
    .attr("height", 14)
    .attr("rx", 3)
    .style("fill", "var(--bg-tint)")
    .style("stroke", "var(--border)");

  svg
    .append("line")
    .attr("x1", x(data.statutory))
    .attr("x2", x(data.statutory))
    .attr("y1", y - 13)
    .attr("y2", y + 13)
    .style("stroke", "var(--negative)")
    .style("stroke-width", 1.5)
    .style("stroke-dasharray", "3 2");

  mono(svg.append("text").attr("x", pad).attr("y", y + 26).text("day 0 · period end"), 9);
  mono(
    svg
      .append("text")
      .attr("x", width - pad)
      .attr("y", y + 26)
      .attr("text-anchor", "end")
      .text(`day ${data.statutory} · statutory deadline`),
    9,
  );

  const g = svg.append("g").selectAll("g").data(data.filings).join("g");
  g.append("circle")
    .attr("cx", (d) => x(Math.min(d.day, data.statutory)))
    .attr("cy", y)
    .attr("r", 4.5)
    .style("fill", "var(--accent)")
    .style("stroke", "var(--bg-card)")
    .style("stroke-width", 1.5);
  g.append("title").text((d) => `${d.label} — filed day ${d.day}`);
};

export function WindowStrip({ statutory, filings }: WindowStripData) {
  const data = useMemo(() => ({ statutory, filings }), [statutory, filings]);
  return <Chart draw={windowDraw} data={data} height={56} label="Statutory filing window" />;
}
