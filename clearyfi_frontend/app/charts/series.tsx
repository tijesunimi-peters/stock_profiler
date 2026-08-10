/**
 * Time-series charts.
 *
 * The gap behaviour is a requirement, not a style (HANDOFF §3.4): a period that was not
 * disclosed is `null`, and `line().defined(d => d.value != null)` BREAKS the line there. An
 * interpolated segment across a gap would be us inventing a filing.
 */
import { useMemo } from "react";
import { Chart } from "./Chart";
import { anim, attachReadout, clampX, edgeAnchor, gridStyle, makeReadout, mono, sans, type DrawFn } from "./kernel";

export interface SeriesPoint {
  period: string;
  value: number | null;
}

export interface Series {
  id: string;
  label: string;
  points: SeriesPoint[];
  /** `a`/`b` are the categorical compare identities; `focal` is the accent. */
  kind?: "focal" | "a" | "b" | "peer";
  /**
   * Explicit stroke, for a view that assigns a colour per SELECTION SLOT rather than per
   * meaning — the overlay picker colours slot 1/2/3 so the legend, the chips and the line agree.
   */
  color?: string;
  dashed?: boolean;
}

export interface SeriesData {
  series: Series[];
  format: (v: number) => string;
  /** Draw a filled area under a single series. */
  area?: boolean;
  /** Legend inside the plot — end-of-line labels collide whenever lines converge (§6.5). */
  legend?: boolean;
  yLabel?: string;
}

const M = { top: 12, right: 14, bottom: 26, left: 46 };

function strokeFor(kind: Series["kind"], color?: string): string {
  if (color) return color;
  return kind === "b"
    ? "var(--gaap-color)"
    : kind === "peer"
      ? "var(--border-strong)"
      : "var(--accent)";
}

const seriesDraw: DrawFn<SeriesData> = (svg, { d3, still, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());

  const periods = data.series[0]?.points.map((p) => p.period) ?? [];
  if (!periods.length) return;

  const ih = height - M.top - M.bottom;

  const values = data.series.flatMap((s) =>
    s.points.map((p) => p.value).filter((v): v is number => v != null),
  );
  if (!values.length) {
    mono(svg.append("text").attr("x", M.left).attr("y", height / 2).text("no disclosed value in this window"));
    return;
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const padY = (hi - lo || Math.abs(hi) || 1) * 0.18;
  const y = d3
    .scaleLinear()
    .domain([lo - padY, hi + padY])
    .nice()
    .range([ih, 0]);

  /*
   * The left margin is measured, not assumed.
   *
   * `M.left` is 46px, and the y labels are right-aligned into it — which leaves about 6px of slack
   * at "10000M" (36.7px in IBM Plex Mono at 9px). Any label longer than that, or the same label in
   * a wider fallback face before the webfont loads, runs off the left edge of the chart. That is a
   * silent, environment-dependent clip: it renders fine on the machine it was built on.
   *
   * So the ticks are measured in this SVG, at the size `gridStyle` will draw them, and the margin
   * only ever GROWS from the shared default — no existing chart loses plot width.
   */
  const probe = svg.append("g").style("opacity", 0);
  let widest = 0;
  for (const t of y.ticks(4)) {
    const node = mono(probe.append("text").text(data.format(t as number)), 9).node() as
      | SVGTextElement
      | null;
    widest = Math.max(widest, node?.getComputedTextLength?.() ?? 0);
  }
  probe.remove();
  const left = Math.max(M.left, Math.ceil(widest) + 12);

  const iw = width - left - M.right;
  const x = d3.scalePoint<string>().domain(periods).range([0, iw]).padding(0.08);

  const g = svg.append("g").attr("transform", `translate(${left},${M.top})`);

  const yAxis = g
    .append("g")
    .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat((v) => data.format(v as number)) as any);
  gridStyle(yAxis);

  const step = Math.max(1, Math.ceil(periods.length / 8));
  const xAxis = g
    .append("g")
    .attr("transform", `translate(0,${ih})`)
    .call(
      d3
        .axisBottom(x)
        .tickSize(0)
        .tickValues(periods.filter((_p, i) => i % step === 0)) as any,
    );
  gridStyle(xAxis);

  const line = d3
    .line<SeriesPoint>()
    .defined((d) => d.value != null)
    .x((d) => x(d.period) ?? 0)
    .y((d) => y(d.value as number));

  if (data.area && data.series.length === 1) {
    const area = d3
      .area<SeriesPoint>()
      .defined((d) => d.value != null)
      .x((d) => x(d.period) ?? 0)
      .y0(ih)
      .y1((d) => y(d.value as number));
    g.append("path")
      .datum(data.series[0].points)
      .attr("d", area)
      .style("fill", "var(--accent-wash)")
      .style("fill-opacity", 0.75);
  }

  const paths = g
    .selectAll<SVGPathElement, Series>("path.series")
    .data(data.series, (d) => d.id)
    .join("path")
    .attr("class", "series")
    .attr("fill", "none")
    .style("stroke", (d) => strokeFor(d.kind, d.color))
    .style("stroke-width", (d) => (d.kind === "peer" ? 1 : 1.8))
    .style("stroke-dasharray", (d) => (d.dashed ? "4 3" : "none"))
    .attr("d", (d) => line(d.points));

  anim(paths, still).attr("d", (d: Series) => line(d.points));

  // Marks only where a value exists — a dot in a gap would be the same lie as a joined line.
  //
  // Keyed by INDEX, not by series id: an id is caller-supplied ("R&D expense") and a class
  // selector built from one throws on the first space or ampersand.
  data.series.forEach((s, si) => {
    g.selectAll(`circle.pt-${si}`)
      .data(s.points.filter((p) => p.value != null))
      .join("circle")
      .attr("class", `pt-${si}`)
      .attr("cx", (d) => x(d.period) ?? 0)
      .attr("cy", (d) => y(d.value as number))
      .attr("r", 2.6)
      .style("fill", strokeFor(s.kind, s.color))
      .append("title")
      .text((d) => `${s.label} · ${d.period} — ${data.format(d.value as number)}`);
  });

  // Gaps are annotated, not silently skipped. Past two of them the per-gap labels collide into
  // an unreadable band, so they collapse to one count — the marks still show WHERE each gap is.
  const gaps = data.series[0].points.filter((p) => p.value == null);
  for (const gp of gaps) {
    const gx = x(gp.period) ?? 0;
    g.append("line")
      .attr("x1", gx)
      .attr("x2", gx)
      .attr("y1", 0)
      .attr("y2", ih)
      .style("stroke", "var(--border-strong)")
      .style("stroke-dasharray", "2 3")
      .style("stroke-width", 1);
    if (gaps.length <= 2) {
      mono(
        g
          .append("text")
          .attr("x", clampX(gx, iw))
          .attr("y", -2)
          .attr("text-anchor", edgeAnchor(gx, iw))
          .text("not disclosed"),
        8,
      );
    }
  }
  if (gaps.length > 2) {
    mono(
      g.append("text").attr("x", iw).attr("y", -2).attr("text-anchor", "end").text(
        `${gaps.length} of ${periods.length} periods not disclosed`,
      ),
      8.5,
    );
  }

  if (data.legend && data.series.length > 1) {
    const lg = g.append("g").attr("transform", `translate(6,6)`);
    data.series.forEach((s, i) => {
      const row = lg.append("g").attr("transform", `translate(0,${i * 14})`);
      row
        .append("line")
        .attr("x1", 0)
        .attr("x2", 14)
        .attr("y1", 0)
        .attr("y2", 0)
        .style("stroke", strokeFor(s.kind, s.color))
        .style("stroke-width", 1.8)
        .style("stroke-dasharray", s.dashed ? "4 3" : "none");
      sans(row.append("text").attr("x", 19).attr("y", 3.5).text(s.label), 10.5, 500);
    });
  }

  const readout = container ? makeReadout(container) : null;
  readout?.hide();
  svg
    .append("rect")
    .attr("x", left)
    .attr("y", M.top)
    .attr("width", iw)
    .attr("height", ih)
    .style("fill", "transparent")
    .on("mousemove", (event) => {
      const [px, py] = d3.pointer(event, container as any);
      const rel = px - left;
      let nearest = periods[0];
      let best = Infinity;
      for (const p of periods) {
        const d = Math.abs((x(p) ?? 0) - rel);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      const lines = [nearest];
      for (const s of data.series) {
        const pt = s.points.find((p) => p.period === nearest);
        lines.push(
          `${s.label} ${pt && pt.value != null ? data.format(pt.value) : "not disclosed"}`,
        );
      }
      readout?.show(px, py, lines);
    })
    .on("mouseleave", () => readout?.hide());
};

export function SeriesChart({
  series,
  format = (v) => String(Math.round(v * 10) / 10),
  area,
  legend,
  height = 220,
  label,
}: {
  series: Series[];
  format?: (v: number) => string;
  area?: boolean;
  legend?: boolean;
  height?: number;
  label?: string;
}) {
  const data = useMemo<SeriesData>(() => ({ series, format, area, legend }), [series, format, area, legend]);
  return <Chart draw={seriesDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- sparkline

const sparkDraw: DrawFn<{ points: SeriesPoint[] }> = (svg, { d3, width, height, data }) => {
  svg.selectAll("*").remove();
  const vals = data.points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return;
  const x = d3.scalePoint<string>().domain(data.points.map((p) => p.period)).range([1, width - 1]);
  const y = d3
    .scaleLinear()
    .domain([Math.min(...vals), Math.max(...vals)])
    .range([height - 2, 2]);
  const line = d3
    .line<SeriesPoint>()
    .defined((d) => d.value != null)
    .x((d) => x(d.period) ?? 0)
    .y((d) => y(d.value as number));
  svg
    .append("path")
    .datum(data.points)
    .attr("d", line)
    .attr("fill", "none")
    .style("stroke", "var(--accent)")
    .style("stroke-width", 1.3);
  const last = [...data.points].reverse().find((p) => p.value != null);
  if (last)
    svg
      .append("circle")
      .attr("cx", x(last.period) ?? 0)
      .attr("cy", y(last.value as number))
      .attr("r", 1.9)
      .style("fill", "var(--accent)");
};

/** The 58×18 / 76×24 inline thumbnail. Always sits inside a button that toggles the trend. */
export function Sparkline({ points, height = 18 }: { points: SeriesPoint[]; height?: number }) {
  const data = useMemo(() => ({ points }), [points]);
  return <Chart className="spark" draw={sparkDraw} data={data} height={height} fallbackWidth={72} />;
}

// ---------------------------------------------------------------------------- stacked area

export interface StackedAreaData {
  periods: string[];
  bands: { key: string; label: string; values: number[] }[];
  /** Normalize each column to 100%. */
  normalize?: boolean;
}

/**
 * 100% stacked area — register composition over time. Single-hue ramp: the bands are parts of
 * one whole, and a categorical palette here would imply they are unrelated entities.
 */
const stackedAreaDraw: DrawFn<StackedAreaData> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const rows = data.periods.map((p, i) => {
    const row: Record<string, number | string> = { period: p };
    let total = 0;
    for (const b of data.bands) total += b.values[i] ?? 0;
    for (const b of data.bands)
      row[b.key] = data.normalize === false ? (b.values[i] ?? 0) : ((b.values[i] ?? 0) / (total || 1)) * 100;
    return row;
  });

  const keys = data.bands.map((b) => b.key);
  const stack = d3.stack<Record<string, number | string>>().keys(keys);
  const layers = stack(rows as any);

  const x = d3.scalePoint<string>().domain(data.periods).range([0, iw]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(layers, (l) => d3.max(l, (p) => p[1])) ?? 100])
    .range([ih, 0]);

  const area = d3
    .area<any>()
    .x((_d, i) => x(data.periods[i]) ?? 0)
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]));

  const ramp = d3.scaleLinear<string>().domain([0, Math.max(1, keys.length - 1)]).range(["#c0703a", "#f0dcc6"]);

  const bandPaths = g
    .selectAll("path")
    .data(layers)
    .join("path")
    .attr("d", area as any)
    .style("fill", (_d, i) => ramp(i))
    .style("stroke", "var(--bg-card)")
    .style("stroke-width", 0.5);

  attachReadout(bandPaths, container, (_d: any) => {
    const i = layers.indexOf(_d);
    const band = data.bands[i];
    const last = band ? band.values[band.values.length - 1] : 0;
    const total = data.bands.reduce((a, b) => a + b.values[b.values.length - 1], 0) || 1;
    return [band?.label ?? "", `${((last / total) * 100).toFixed(1)}% at the latest period`];
  });

  bandPaths.append("title").text((_d, i) => data.bands[i].label);

  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickSize(0) as any),
  );
  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat((v) => `${v}%`) as any));
};

export function StackedAreaChart({
  periods,
  bands,
  height = 200,
  label,
}: {
  periods: string[];
  bands: { key: string; label: string; values: number[] }[];
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ periods, bands }), [periods, bands]);
  return <Chart draw={stackedAreaDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- step chart

export interface StepSeries {
  id: string;
  label: string;
  points: { date: string; value: number }[];
}

/**
 * Cumulative stake history, `curveStepAfter` — a stake changes on a filing date, not smoothly
 * between them. Carries the 5% threshold rule that makes a 13D/G obligation legible.
 */
const stepDraw: DrawFn<{ series: StepSeries[]; threshold?: number }> = (
  svg,
  { d3, width, height, data, container },
) => {
  svg.selectAll("*").remove();
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const all = data.series.flatMap((s) => s.points);
  if (!all.length) return;
  const x = d3
    .scaleTime()
    .domain(d3.extent(all, (p) => new Date(p.date)) as [Date, Date])
    .range([0, iw]);
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(data.threshold ?? 0, d3.max(all, (p) => p.value) ?? 1) * 1.15])
    .range([ih, 0]);

  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat((v) => `${v}%`) as any));
  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(4).tickSize(0) as any),
  );

  if (data.threshold != null) {
    g.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", y(data.threshold))
      .attr("y2", y(data.threshold))
      .style("stroke", "var(--negative)")
      .style("stroke-dasharray", "4 3")
      .style("stroke-width", 1);
    mono(
      g.append("text").attr("x", iw).attr("y", y(data.threshold) - 4).attr("text-anchor", "end").text(
        `${data.threshold}% — reporting threshold`,
      ),
      8.5,
    );
  }

  const line = d3
    .line<{ date: string; value: number }>()
    .curve(d3.curveStepAfter)
    .x((p) => x(new Date(p.date)))
    .y((p) => y(p.value));

  // Series names go in a legend: every 13D/G line ends just above 5%, so end-of-line labels
  // always collide (RECONCILIATION §6.5).
  const ramp = ["var(--accent)", "var(--gaap-color)", "var(--ink-soft)", "var(--caution)"];
  data.series.forEach((s, i) => {
    g.append("path")
      .datum(s.points)
      .attr("d", line)
      .attr("fill", "none")
      .style("stroke", ramp[i % ramp.length])
      .style("stroke-width", 1.7);
    // A step changes on a FILING DATE, so the readout hangs off the filing points themselves.
    const dots = g
      .selectAll(`circle.step-${i}`)
      .data(s.points)
      .join("circle")
      .attr("class", `step-${i}`)
      .attr("cx", (p: any) => x(new Date(p.date)))
      .attr("cy", (p: any) => y(p.value))
      .attr("r", 3.4)
      .style("fill", ramp[i % ramp.length])
      .style("fill-opacity", 0.9);
    attachReadout(dots, container, (p: any) => [s.label, `${p.value}%`, p.date]);
  });

  const lg = g.append("g").attr("transform", "translate(8,6)");
  data.series.forEach((s, i) => {
    const row = lg.append("g").attr("transform", `translate(0,${i * 13})`);
    row
      .append("line")
      .attr("x1", 0)
      .attr("x2", 12)
      .style("stroke", ramp[i % ramp.length])
      .style("stroke-width", 1.7);
    sans(row.append("text").attr("x", 17).attr("y", 3.5).text(s.label), 10, 500);
  });
};

export function StepChart({
  series,
  threshold,
  height = 220,
  label,
}: {
  series: StepSeries[];
  threshold?: number;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ series, threshold }), [series, threshold]);
  return <Chart draw={stepDraw} data={data} height={height} label={label} />;
}
