/**
 * Bar-family charts: histogram, stacked columns, event strip, divergence, pareto, dumbbell,
 * gantt.
 *
 * Ranked bars take ONE fill with emphasis, never a palette — a per-bar hue would read as
 * category when the bars are one magnitude. Magnitude ramps stay single-hue sequential, never
 * diverging, never green/red (HANDOFF §3.1, §3.6).
 */
import { useMemo } from "react";
import { Chart } from "./Chart";
import {
  anim,
  attachReadout,
  clampX,
  edgeAnchor,
  gridStyle,
  makeReadout,
  mono,
  sans,
  widestLabel,
  type DrawFn,
} from "./kernel";

const M = { top: 14, right: 16, bottom: 28, left: 46 };

// ---------------------------------------------------------------------------- histogram

export interface HistogramBin {
  label: string;
  n: number;
  /** Marks the bin the median falls in — the dashed rule is drawn on it. */
  median?: boolean;
}

export interface HistogramData {
  values: number[];
  /** Printed as the median label — pass the real median, NOT the bin it lands in. */
  median: number;
  format: (v: number) => string;
  xLabel?: string;
  /**
   * Pre-binned categories, used INSTEAD of binning `values`.
   *
   * For a quantity that is already discrete and small — business days to file, say — letting d3
   * choose thresholds invents fractional buckets ("1.4 to 1.8 days") that the underlying data
   * cannot occupy. When the categories are the data, pass them.
   */
  bins?: HistogramBin[];
}

const histogramDraw: DrawFn<HistogramData> = (svg, { d3, still, width, height, data, container }) => {
  svg.selectAll("*").remove();
  if (!data.bins?.length && !data.values.length) return;
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  // Categorical branch: the caller already knows the buckets, so a band scale draws them as the
  // discrete things they are rather than as slices of a continuum.
  if (data.bins?.length) {
    const bins = data.bins;
    const bx = d3
      .scaleBand()
      .domain(bins.map((b) => b.label))
      .range([0, iw])
      .paddingInner(0.28);
    const bw = Math.max(3, bx.bandwidth());
    const cx = (b: HistogramBin) => (bx(b.label) ?? 0) + bx.bandwidth() / 2;
    const mx = d3.max(bins, (b) => b.n) ?? 1;
    const by = d3.scaleLinear().domain([0, mx]).range([ih, 0]);

    gridStyle(
      g.append("g").call(d3.axisLeft(by).tickValues([0, mx / 2, mx]).tickFormat((v) => String(Math.round(v as number))).tickSize(-iw) as any),
    );
    gridStyle(g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(bx).tickSize(0) as any));

    const rects = g
      .selectAll("rect")
      .data(bins)
      .join("rect")
      .attr("rx", 1.5)
      .attr("x", (b) => cx(b) - bw / 2)
      .attr("width", bw)
      .attr("y", (b) => by(b.n))
      .attr("height", (b) => Math.max(1, ih - by(b.n)))
      .style("fill", "var(--accent)")
      .style("fill-opacity", 0.45);

    anim(rects, still)
      .attr("y", (b: any) => by(b.n))
      .attr("height", (b: any) => Math.max(1, ih - by(b.n)));

    attachReadout(rects, container, (b: any) => [
      `${b.label}${data.xLabel ? ` ${data.xLabel}` : ""}`,
      `${b.n} filing${b.n === 1 ? "" : "s"}`,
    ]);

    for (const b of bins.filter((z) => z.median)) {
      const mlx = cx(b);
      g.append("line")
        .attr("x1", mlx)
        .attr("x2", mlx)
        .attr("y1", -4)
        .attr("y2", ih)
        .style("stroke", "var(--ink)")
        .style("stroke-width", 1.6)
        .style("stroke-dasharray", "4 3");
      mono(
        g
          .append("text")
          .attr("x", clampX(mlx + 5, iw))
          .attr("y", -6)
          .attr("text-anchor", edgeAnchor(mlx, iw))
          .text(`median ${data.format(data.median)}`),
        9.5,
      );
    }

    if (data.xLabel) {
      mono(
        g.append("text").attr("x", iw / 2).attr("y", ih + 26).attr("text-anchor", "middle").text(data.xLabel),
        9,
      );
    }
    return;
  }

  const x = d3
    .scaleLinear()
    .domain(d3.extent(data.values) as [number, number])
    .nice();
  const bins = d3.bin().domain(x.domain() as [number, number]).thresholds(12)(data.values);
  x.range([0, iw]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (b) => b.length) ?? 1])
    .nice()
    .range([ih, 0]);

  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iw) as any));
  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(0).tickFormat((v) => data.format(v as number)) as any),
  );

  const bars = g
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (b) => x(b.x0 as number) + 0.5)
    .attr("width", (b) => Math.max(1, x(b.x1 as number) - x(b.x0 as number) - 1))
    .attr("y", (b) => y(b.length))
    .attr("height", (b) => ih - y(b.length))
    .style("fill", "var(--accent)")
    .style("fill-opacity", 0.55);

  anim(bars, still)
    .attr("y", (b: any) => y(b.length))
    .attr("height", (b: any) => ih - y(b.length));

  attachReadout(bars, container, (b: any) => [
    `${data.format(b.x0)} – ${data.format(b.x1)}`,
    `${b.length} observation${b.length === 1 ? "" : "s"}`,
  ]);

  const mx = x(data.median);
  g.append("line")
    .attr("x1", mx)
    .attr("x2", mx)
    .attr("y1", -4)
    .attr("y2", ih)
    .style("stroke", "var(--ink)")
    .style("stroke-width", 1.5);
  mono(
    g
      .append("text")
      .attr("x", clampX(mx, iw))
      .attr("y", -6)
      .attr("text-anchor", edgeAnchor(mx, iw))
      // The median label prints the PASSED median, not the bin edge it happens to sit on.
      .text(`median ${data.format(data.median)}`),
    9,
  );
};

export function Histogram({
  values = [],
  bins,
  median,
  format = (v) => String(Math.round(v)),
  xLabel,
  height = 200,
  label,
}: {
  values?: number[];
  /** Pass instead of `values` when the buckets are already discrete. */
  bins?: HistogramBin[];
  median: number;
  format?: (v: number) => string;
  xLabel?: string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(
    () => ({ values, bins, median, format, xLabel }),
    [values, bins, median, format, xLabel],
  );
  return <Chart draw={histogramDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- stacked columns

/**
 * The band colours a stacked column uses, for `n` parts.
 *
 * Exported so a caller that lays its legend out in the DOM can colour the swatches from the
 * same ramp the chart fills with. A legend whose colours do not match the bars is worse than
 * no legend, and the ramp is the chart's, not the caller's, to choose.
 */
export function stackRamp(n: number): string[] {
  const lo = [0xc0, 0x70, 0x3a];
  const hi = [0xf0, 0xdc, 0xc6];
  const span = Math.max(1, n - 1);
  return Array.from({ length: n }, (_x, i) => {
    const t = i / span;
    const c = lo.map((v, j) => Math.round(v + (hi[j] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  });
}

export interface StackedColumnsData {
  columns: { key: string; label: string; parts: { key: string; label: string; value: number }[] }[];
  format: (v: number) => string;
  /** Render each column as 100% of itself. */
  normalize?: boolean;
  /** Off when the caller lays the legend out itself — see `stackRamp`. */
  legend?: boolean;
}

const stackedColsDraw: DrawFn<StackedColumnsData> = (svg, { d3, still, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const x = d3
    .scaleBand<string>()
    .domain(data.columns.map((c) => c.key))
    .range([0, iw])
    .padding(0.42);
  const totals = data.columns.map((c) => c.parts.reduce((a, p) => a + p.value, 0));
  const yMax = data.normalize === false ? Math.max(...totals) : 100;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([ih, 0]);

  gridStyle(
    g.append("g").call(
      d3
        .axisLeft(y)
        .ticks(4)
        .tickSize(-iw)
        .tickFormat((v) => (data.normalize === false ? data.format(v as number) : `${v}%`)) as any,
    ),
  );
  gridStyle(g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickSize(0) as any));

  const partKeys = Array.from(new Set(data.columns.flatMap((c) => c.parts.map((p) => p.key))));
  const ramp = d3
    .scaleLinear<string>()
    .domain([0, Math.max(1, partKeys.length - 1)])
    .range(["#c0703a", "#f0dcc6"]);

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  for (const col of data.columns) {
    const total = col.parts.reduce((a, p) => a + p.value, 0) || 1;
    let acc = 0;
    const scaled = col.parts.map((p) => {
      const v = data.normalize === false ? p.value : (p.value / total) * 100;
      const seg = { ...p, y0: acc, y1: acc + v, shown: v };
      acc += v;
      return seg;
    });
    const cg = g.append("g").attr("transform", `translate(${x(col.key) ?? 0},0)`);
    const rects = cg
      .selectAll("rect")
      .data(scaled)
      .join("rect")
      .attr("x", 0)
      .attr("width", x.bandwidth())
      .attr("y", (d) => y(d.y1))
      .attr("height", (d) => Math.max(0, y(d.y0) - y(d.y1)))
      .style("fill", (d) => ramp(partKeys.indexOf(d.key)))
      .style("stroke", "var(--bg-card)")
      .style("stroke-width", 0.6);

    anim(rects, still)
      .attr("y", (d: any) => y(d.y1))
      .attr("height", (d: any) => Math.max(0, y(d.y0) - y(d.y1)));

    rects
      .on("mousemove", (event, d) => {
        const [px, py] = d3.pointer(event, container as any);
        readout?.show(px, py, [d.label, `${Math.round(d.shown * 10) / 10}${data.normalize === false ? "" : "%"}`, col.label]);
      })
      .on("mouseleave", () => readout?.hide());

    rects.append("title").text((d) => `${col.label} · ${d.label}`);
  }

  const lg = svg.append("g").attr("transform", `translate(${M.left},${height - 8})`);
  // The legend WRAPS. Laid out on one line it runs off the frame as soon as the segment labels
  // are prose rather than tokens ("Interest, financing or regulated tariff" overhung by 149px
  // at 1024) — and a legend outside the viewBox is silently clipped, not scrollable.
  if (data.legend === false) return;

  let lx = 0;
  let ly = 0;
  partKeys.forEach((k, i) => {
    const label = data.columns.flatMap((c) => c.parts).find((p) => p.key === k)?.label ?? k;
    const w = 22 + label.length * 5.4;
    if (lx > 0 && lx + w > iw) {
      lx = 0;
      ly += 13;
    }
    const row = lg.append("g").attr("transform", `translate(${lx},${ly})`);
    row.append("rect").attr("width", 8).attr("height", 8).attr("y", -8).attr("rx", 2).style("fill", ramp(i));
    mono(row.append("text").attr("x", 12).attr("y", -1).text(label), 8.5);
    lx += w;
  });
};

export function StackedColumns({
  columns,
  format = (v) => String(v),
  normalize,
  legend,
  height = 240,
  label,
}: {
  columns: StackedColumnsData["columns"];
  format?: (v: number) => string;
  normalize?: boolean;
  legend?: boolean;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ columns, format, normalize, legend }), [columns, format, normalize, legend]);
  return <Chart draw={stackedColsDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- event strip

export interface EventLane {
  id: string;
  label: string;
  events: { id: string; date: string; kind: string; title: string }[];
}

/**
 * Dated filings, one lane per holder. The tick step adapts to the span so the axis never
 * crowds; the origin tick belongs to the x axis only (RECONCILIATION §6.4).
 */
const eventStripDraw: DrawFn<{ lanes: EventLane[] }> = (
  svg,
  { d3, width, height, data, container },
) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  // Measured, not assumed — see `widestLabel`. Only ever grows from the design's 96px.
  const left = Math.max(
    96,
    Math.ceil(widestLabel(svg, data.lanes.map((l) => l.label), (t) => sans(t, 10.5, 500))) + 12,
  );
  const iw = width - left - 16;
  const ih = height - 30;
  const g = svg.append("g").attr("transform", `translate(${left},10)`);

  const all = data.lanes.flatMap((l) => l.events);
  if (!all.length) {
    mono(svg.append("text").attr("x", 0).attr("y", 18).text("no filings in this window"));
    return;
  }
  const x = d3
    .scaleTime()
    .domain(d3.extent(all, (e) => new Date(e.date)) as [Date, Date])
    .range([0, iw])
    .nice();
  const yb = d3
    .scaleBand<string>()
    .domain(data.lanes.map((l) => l.id))
    .range([0, ih])
    .padding(0.32);

  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 110))).tickSize(-ih) as any),
  );

  for (const lane of data.lanes) {
    const y = (yb(lane.id) ?? 0) + yb.bandwidth() / 2;
    sans(
      svg
        .append("text")
        .attr("x", left - 10)
        .attr("y", y + 13.5)
        .attr("text-anchor", "end")
        .text(lane.label),
      10.5,
      500,
    );
    g.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", y)
      .attr("y2", y)
      .style("stroke", "var(--border)")
      .style("stroke-width", 1);
  }

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  const marks = g
    .append("g")
    .selectAll("g")
    .data(data.lanes.flatMap((l) => l.events.map((e) => ({ ...e, lane: l.id, laneLabel: l.label }))))
    .join("g")
    .attr(
      "transform",
      (d) => `translate(${x(new Date(d.date))},${(yb(d.lane) ?? 0) + yb.bandwidth() / 2})`,
    );

  // Categorical flag hues only — restatement and going-concern are categories, not bad values.
  marks
    .append("circle")
    .attr("r", 4)
    .style("fill", (d) =>
      d.kind === "restatement" || d.kind === "going-concern"
        ? "var(--ext-color)"
        : d.kind === "amendment"
          ? "var(--gaap-color)"
          : "var(--accent)",
    )
    .style("stroke", "var(--bg-card)")
    .style("stroke-width", 1.4);

  marks
    .on("mousemove", (event, d) => {
      const [px, py] = d3.pointer(event, container as any);
      readout?.show(px, py, [d.title, d.date, d.laneLabel]);
    })
    .on("mouseleave", () => readout?.hide());

  marks.append("title").text((d) => `${d.laneLabel} · ${d.date} — ${d.title}`);
};

export function EventStrip({ lanes, height, label }: { lanes: EventLane[]; height?: number; label?: string }) {
  const data = useMemo(() => ({ lanes }), [lanes]);
  return (
    <Chart
      draw={eventStripDraw}
      data={data}
      height={height ?? Math.max(90, lanes.length * 26 + 40)}
      label={label}
    />
  );
}

// ---------------------------------------------------------------------------- divergence

export interface DivergeRow {
  key: string;
  label: string;
  /** Positive above the axis, negative below. */
  value: number;
}

const divergeDraw: DrawFn<{ rows: DivergeRow[]; format: (v: number) => string }> = (
  svg,
  { d3, still, width, height, data, container },
) => {
  svg.selectAll("*").remove();
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom - 12;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const max = Math.max(...data.rows.map((r) => Math.abs(r.value)), 1);
  const y = d3.scaleLinear().domain([-max, max]).range([ih, 0]); // symmetric
  const x = d3
    .scaleBand<string>()
    .domain(data.rows.map((r) => r.key))
    .range([0, iw])
    .padding(0.35);

  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat((v) => data.format(v as number)) as any));

  g.append("line")
    .attr("x1", 0)
    .attr("x2", iw)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .style("stroke", "var(--ink)")
    .style("stroke-width", 1.2);

  const bars = g
    .selectAll("rect")
    .data(data.rows)
    .join("rect")
    .attr("x", (d) => x(d.key) ?? 0)
    .attr("width", x.bandwidth())
    .attr("y", (d) => (d.value >= 0 ? y(d.value) : y(0)))
    .attr("height", (d) => Math.abs(y(d.value) - y(0)))
    .style("fill", "var(--accent)")
    .style("fill-opacity", (d) => (d.value >= 0 ? 0.72 : 0.35));

  anim(bars, still)
    .attr("y", (d: DivergeRow) => (d.value >= 0 ? y(d.value) : y(0)))
    .attr("height", (d: DivergeRow) => Math.abs(y(d.value) - y(0)));

  attachReadout(bars, container, (d: DivergeRow) => [
    d.label,
    data.format(d.value),
    d.value >= 0 ? "added" : "reduced",
  ]);
  bars.append("title").text((d) => `${d.label} — ${data.format(d.value)}`);

  data.rows.forEach((r) => {
    const cx = (x(r.key) ?? 0) + x.bandwidth() / 2;
    mono(
      g
        .append("text")
        .attr("x", clampX(cx, iw))
        .attr("y", ih + 14)
        .attr("text-anchor", edgeAnchor(cx, iw))
        .text(r.label),
      8.5,
    );
  });
};

export function DivergeChart({
  rows,
  format = (v) => String(Math.round(v)),
  height = 200,
  label,
}: {
  rows: DivergeRow[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ rows, format }), [rows, format]);
  return <Chart draw={divergeDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- pareto

export interface ParetoRow {
  key: string;
  label: string;
  value: number;
  /** Prior-period value, drawn as a ghost line in the same hue. */
  prior?: number;
}

const paretoDraw: DrawFn<{ rows: ParetoRow[]; format: (v: number) => string; total?: number }> = (
  svg,
  { d3, still, width, height, data, container },
) => {
  svg.selectAll("*").remove();
  const right = 44;
  const iw = width - M.left - right;
  const ih = height - M.top - M.bottom - 14;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

  const rows = [...data.rows].sort((a, b) => b.value - a.value);
  /*
   * The cumulative curve divides by the WHOLE, which is not always the rows drawn.
   *
   * Defaulting to the sum of `rows` makes the curve reach 100% at the last bar — fine when the
   * rows are the whole population, and a false claim when they are a top-N. §03 passes the top 20
   * of a 6,044-manager register, so the curve asserted that 20 managers are the entire register
   * where the truth is nearer 57%. `data.total`, when given, is that denominator.
   */
  const total = data.total ?? (rows.reduce((a, r) => a + r.value, 0) || 1);
  const x = d3
    .scaleBand<string>()
    .domain(rows.map((r) => r.key))
    .range([0, iw])
    .padding(0.3);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (r) => r.value) ?? 1])
    .nice()
    .range([ih, 0]);
  const yc = d3.scaleLinear().domain([0, 100]).range([ih, 0]);

  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat((v) => data.format(v as number)) as any));
  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(${iw},0)`)
      .call(d3.axisRight(yc).ticks(4).tickFormat((v) => `${v}%`) as any),
  );

  // One fill with emphasis on the leader — not a palette.
  const bars = g
    .selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", (d) => x(d.key) ?? 0)
    .attr("width", x.bandwidth())
    .attr("y", (d) => y(d.value))
    .attr("height", (d) => ih - y(d.value))
    .style("fill", "var(--accent)")
    .style("fill-opacity", (_d, i) => (i === 0 ? 0.9 : 0.45));

  anim(bars, still)
    .attr("y", (d: ParetoRow) => y(d.value))
    .attr("height", (d: ParetoRow) => ih - y(d.value));

  attachReadout(bars, container, (d: ParetoRow) => {
    const share = (d.value / total) * 100;
    return [
      d.label,
      data.format(d.value),
      `${share.toFixed(1)}% of the total`,
      d.prior != null ? `prior ${data.format(d.prior)}` : "",
    ].filter(Boolean);
  });
  bars.append("title").text((d) => `${d.label} — ${data.format(d.value)}`);

  let acc = 0;
  const cum = rows.map((r) => {
    acc += r.value;
    return { key: r.key, pct: (acc / total) * 100 };
  });
  const line = d3
    .line<{ key: string; pct: number }>()
    .x((d) => (x(d.key) ?? 0) + x.bandwidth() / 2)
    .y((d) => yc(d.pct));
  g.append("path")
    .datum(cum)
    .attr("d", line)
    .attr("fill", "none")
    .style("stroke", "var(--ink)")
    .style("stroke-width", 1.5);

  if (rows.some((r) => r.prior != null)) {
    let pacc = 0;
    const ptotal = rows.reduce((a, r) => a + (r.prior ?? 0), 0) || 1;
    const pcum = rows.map((r) => {
      pacc += r.prior ?? 0;
      return { key: r.key, pct: (pacc / ptotal) * 100 };
    });
    g.append("path")
      .datum(pcum)
      .attr("d", line)
      .attr("fill", "none")
      .style("stroke", "var(--ink)")
      .style("stroke-opacity", 0.35)
      .style("stroke-dasharray", "4 3")
      .style("stroke-width", 1.3);
  }

  // Drop labels rather than let them collide: mono 8.5px paints ~5.3px/char, so a band narrower
  // than its own label gets every Nth label instead. A clipped or overlapping axis is worse
  // than a sparser one, and the bar's <title> still carries the full name.
  const widest = Math.max(...rows.map((r) => r.label.length)) * 5.3;
  const step = Math.max(1, Math.ceil(widest / Math.max(1, x.step())));
  rows.forEach((r, i) => {
    if (i % step !== 0) return;
    const cx = (x(r.key) ?? 0) + x.bandwidth() / 2;
    mono(
      g
        .append("text")
        .attr("x", clampX(cx, iw))
        .attr("y", ih + 14)
        .attr("text-anchor", edgeAnchor(cx, iw))
        .text(r.label),
      8.5,
    );
  });
};

export function ParetoChart({
  rows,
  format = (v) => String(Math.round(v)),
  height = 240,
  label,
  total,
}: {
  rows: ParetoRow[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
  /** The population the cumulative curve is a share OF. Omit when `rows` are the whole. */
  total?: number;
}) {
  const data = useMemo(() => ({ rows, format, total }), [rows, format, total]);
  return <Chart draw={paretoDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- dumbbell

export interface DumbbellRow {
  key: string;
  label: string;
  prior: number;
  current: number;
}

/** Hollow = prior, filled = current. One row per manager. */
const dumbbellDraw: DrawFn<{ rows: DumbbellRow[]; format: (v: number) => string }> = (
  svg,
  { d3, width, height, data, container },
) => {
  svg.selectAll("*").remove();
  /*
   * The label gutter is MEASURED, so a full manager name fits.
   *
   * These are cover-page identities and truncating one ("Geode Capital Manage…") makes two filers
   * look like the same filer — which is why this was a fixed 168px meaning "wide enough for a
   * name". It was not: "PUBLIC SECTOR PENSION INVESTMENT BOARD" renders 224.5px and ran 66.5px
   * past the left edge of the chart and 49.5px past the card, with no clipping to hint at it.
   *
   * So the gutter grows to the widest label it actually has to draw. It is capped at 45% of the
   * chart so a long name cannot squeeze the plot away on a narrow card; only where that cap binds
   * is a label trimmed, and then the full identity stays reachable in the hover readout and in an
   * SVG <title>, so no filer is silently renamed into another.
   */
  const widest = widestLabel(svg, data.rows.map((r) => r.label), (t) => sans(t, 10.5, 500));
  const left = Math.min(Math.max(168, Math.ceil(widest) + 12), Math.max(120, Math.floor(width * 0.45)));
  const labelMax = left - 10;
  const iw = width - left - 54;
  const ih = height - 26;
  const g = svg.append("g").attr("transform", `translate(${left},8)`);

  const all = data.rows.flatMap((r) => [r.prior, r.current]);
  const x = d3
    .scaleLinear()
    .domain([Math.min(...all, 0), Math.max(...all)])
    .nice()
    .range([0, iw]);
  const y = d3
    .scaleBand<string>()
    .domain(data.rows.map((r) => r.key))
    .range([0, ih])
    .padding(0.4);

  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(4).tickSize(-ih).tickFormat((v) => data.format(v as number)) as any),
  );

  for (const r of data.rows) {
    const cy = (y(r.key) ?? 0) + y.bandwidth() / 2;
    const labelEl = sans(
      svg
        .append("text")
        .attr("x", left - 10)
        .attr("y", cy + 11.5)
        .attr("text-anchor", "end")
        .text(r.label),
      10.5,
      500,
    );
    // Only trims where the 45% cap binds — otherwise the gutter was sized to hold this label.
    const node = labelEl.node() as SVGTextElement | null;
    if (node?.getComputedTextLength) {
      let text = r.label;
      while (text.length > 4 && node.getComputedTextLength() > labelMax) {
        text = text.slice(0, -1);
        labelEl.text(`${text.trimEnd()}…`);
      }
    }
    // The full identity, whether or not it was trimmed.
    labelEl.append("title").text(r.label);
    g.append("line")
      .attr("x1", x(r.prior))
      .attr("x2", x(r.current))
      .attr("y1", cy)
      .attr("y2", cy)
      .style("stroke", "var(--border-strong)")
      .style("stroke-width", 2);
    g.append("circle")
      .attr("cx", x(r.prior))
      .attr("cy", cy)
      .attr("r", 4)
      .style("fill", "var(--bg-card)")
      .style("stroke", "var(--ink-soft)")
      .style("stroke-width", 1.4);
    const cur = g.append("circle").attr("cx", x(r.current)).attr("cy", cy).attr("r", 4.2).style("fill", "var(--accent)");
    attachReadout(cur, container, () => [
      r.label,
      `current ${data.format(r.current)}`,
      `prior ${data.format(r.prior)}`,
      `${r.current - r.prior >= 0 ? "↑ +" : "↓ −"}${data.format(Math.abs(r.current - r.prior))}`,
    ]);
    mono(
      g
        .append("text")
        .attr("x", iw + 8)
        .attr("y", cy + 3.5)
        .text(data.format(r.current)),
      9,
    );
  }
};

export function DumbbellChart({
  rows,
  format = (v) => String(Math.round(v)),
  label,
}: {
  rows: DumbbellRow[];
  format?: (v: number) => string;
  label?: string;
}) {
  const data = useMemo(() => ({ rows, format }), [rows, format]);
  return <Chart draw={dumbbellDraw} data={data} height={Math.max(90, rows.length * 26 + 30)} label={label} />;
}

// ---------------------------------------------------------------------------- gantt

export interface GanttRow {
  key: string;
  label: string;
  start: string;
  end: string;
  kind?: "window" | "expiry";
}

/** Forward-time windows and expiries — lock-up ends, blackout windows, filing deadlines. */
const ganttDraw: DrawFn<{ rows: GanttRow[]; today?: string }> = (svg, { d3, width, height, data }) => {
  svg.selectAll("*").remove();
  // Measured, not assumed — see `widestLabel`. Only ever grows from the design's 132px.
  const left = Math.max(
    132,
    Math.ceil(widestLabel(svg, data.rows.map((r) => r.label), (t) => sans(t, 10.5, 500))) + 12,
  );
  const iw = width - left - 18;
  const ih = height - 28;
  const g = svg.append("g").attr("transform", `translate(${left},8)`);

  const dates = data.rows.flatMap((r) => [new Date(r.start), new Date(r.end)]);
  if (!dates.length) return;
  const x = d3.scaleTime().domain(d3.extent(dates) as [Date, Date]).range([0, iw]).nice();
  const y = d3.scaleBand<string>().domain(data.rows.map((r) => r.key)).range([0, ih]).padding(0.35);

  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 120))).tickSize(-ih) as any),
  );

  for (const r of data.rows) {
    const cy = y(r.key) ?? 0;
    sans(
      svg.append("text").attr("x", left - 10).attr("y", cy + y.bandwidth() / 2 + 11.5).attr("text-anchor", "end").text(r.label),
      10.5,
      500,
    );
    g.append("rect")
      .attr("x", x(new Date(r.start)))
      .attr("y", cy)
      .attr("width", Math.max(2, x(new Date(r.end)) - x(new Date(r.start))))
      .attr("height", y.bandwidth())
      .attr("rx", 3)
      .style("fill", r.kind === "expiry" ? "var(--bg-tint)" : "var(--accent-wash)")
      .style("stroke", r.kind === "expiry" ? "var(--border-strong)" : "var(--accent-wash-border)")
      .append("title")
      .text(`${r.label} — ${r.start} → ${r.end}`);
  }

  if (data.today) {
    const tx = x(new Date(data.today));
    g.append("line")
      .attr("x1", tx)
      .attr("x2", tx)
      .attr("y1", -4)
      .attr("y2", ih)
      .style("stroke", "var(--ink)")
      .style("stroke-width", 1.2)
      .style("stroke-dasharray", "3 2");
    mono(g.append("text").attr("x", clampX(tx, iw)).attr("y", -6).attr("text-anchor", edgeAnchor(tx, iw)).text("today"), 8.5);
  }
};

export function GanttChart({ rows, today, label }: { rows: GanttRow[]; today?: string; label?: string }) {
  const data = useMemo(() => ({ rows, today }), [rows, today]);
  return <Chart draw={ganttDraw} data={data} height={Math.max(100, rows.length * 28 + 34)} label={label} />;
}
