/**
 * The remaining chart shapes: radar, treemap, scatter, cohort heatmap, dot calendar, Lorenz
 * curve, log-axis paired dots.
 *
 * Two rules show up repeatedly here:
 *   - magnitude ramps are SINGLE-HUE sequential (never diverging, never green/red);
 *   - size encodes area, so anything sized by a value uses `scaleSqrt`, never a radius scale.
 */
import { useMemo } from "react";
import { Chart } from "./Chart";
import {
  attachReadout,
  edgeAnchor,
  gridStyle,
  makeReadout,
  mono,
  placeLabel,
  sans,
  textWidth,
  widestLabel,
  type Box,
  type DrawFn,
} from "./kernel";

/**
 * Width of the widest row label, measured from the DOM.
 *
 * A fixed gutter is a guess about the longest string a caller will pass, and it is wrong the
 * first time a label grows — "2025 H1 entrants" needs 92px and silently rendered at x = −16
 * against an 84px gutter. Measure, then lay out.
 */
function labelGutter(
  svg: any,
  labels: string[],
  size: number,
  style: "mono" | "sans",
  min: number,
  pad = 12,
): number {
  const probe = svg.append("g").attr("opacity", 0);
  let widest = 0;
  for (const l of labels) {
    const node = probe.append("text").text(l);
    (style === "mono" ? mono : sans)(node, size);
    widest = Math.max(widest, textWidth(node.node()) || l.length * size * 0.58);
  }
  probe.remove();
  return Math.max(min, Math.ceil(widest) + pad);
}

// ---------------------------------------------------------------------------- radar

export interface RadarSeries {
  id: string;
  label: string;
  kind: "a" | "b";
  /** One value per axis, 0–100, in axis order. */
  values: (number | null)[];
}

const radarDraw: DrawFn<{ axes: string[]; series: RadarSeries[] }> = (
  svg,
  { d3, width, height, data },
) => {
  svg.selectAll("*").remove();
  const cx = width / 2;
  const cy = height / 2 + 4;
  /*
   * The radius leaves room for the axis labels it actually has.
   *
   * This reserved a flat 46px while placing labels at `r + 16` — so the real allowance was 30px,
   * and "Health" on the composite-profile radar rendered 1.7px outside the card. Measured here so
   * the ring shrinks instead of the text escaping; never smaller than the original reserve.
   */
  const axisReserve = Math.max(
    46,
    16 + Math.ceil(widestLabel(svg, data.axes ?? [], (t) => mono(t, 8.5))) + 6,
  );
  const r = Math.min(width, height) / 2 - axisReserve;
  const n = data.axes.length;
  const angle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const rs = d3.scaleLinear().domain([0, 100]).range([0, r]);

  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  for (const ring of [25, 50, 75, 100]) {
    g.append("circle")
      .attr("r", rs(ring))
      .attr("fill", "none")
      .style("stroke", "var(--border)")
      .style("stroke-width", ring === 100 ? 1.2 : 1);
  }

  data.axes.forEach((ax, i) => {
    const a = angle(i);
    g.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", Math.cos(a) * r)
      .attr("y2", Math.sin(a) * r)
      .style("stroke", "var(--border)");
    const lx = Math.cos(a) * (r + 16);
    const ly = Math.sin(a) * (r + 16);
    mono(
      g
        .append("text")
        .attr("x", lx)
        .attr("y", ly + 3)
        .attr("text-anchor", Math.abs(lx) < 6 ? "middle" : lx > 0 ? "start" : "end")
        .text(ax),
      8.5,
    );
  });

  const lineR = d3
    .lineRadial<number | null>()
    .defined((v) => v != null)
    .angle((_v, i) => angle(i) + Math.PI / 2)
    .radius((v) => rs(v as number))
    .curve(d3.curveLinearClosed);

  // A/B color is categorical identity, never a verdict (HANDOFF §3.3).
  for (const s of data.series) {
    const stroke = s.kind === "b" ? "var(--gaap-color)" : "var(--accent)";
    g.append("path")
      .datum(s.values)
      .attr("d", lineR as any)
      .attr("fill", stroke)
      .attr("fill-opacity", 0.11)
      .style("stroke", stroke)
      .style("stroke-width", 1.8);
  }

  const lg = svg.append("g").attr("transform", "translate(10,12)");
  data.series.forEach((s, i) => {
    const row = lg.append("g").attr("transform", `translate(0,${i * 14})`);
    row
      .append("rect")
      .attr("width", 9)
      .attr("height", 9)
      .attr("y", -7)
      .attr("rx", 2)
      .style("fill", s.kind === "b" ? "var(--gaap-color)" : "var(--accent)");
    sans(row.append("text").attr("x", 14).attr("y", 1).text(s.label), 10.5, 600);
  });
};

export function RadarChart({
  axes,
  series,
  height = 340,
  label,
}: {
  axes: string[];
  series: RadarSeries[];
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ axes, series }), [axes, series]);
  return <Chart draw={radarDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- treemap

export interface TreemapLeaf {
  id: string;
  label: string;
  value: number;
  /** Optional second line inside the cell. */
  note?: string;
}

const treemapDraw: DrawFn<{ leaves: TreemapLeaf[]; format: (v: number) => string }> = (
  svg,
  { d3, width, height, data, container },
) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  const root = d3
    .hierarchy<{ children?: TreemapLeaf[]; value?: number }>({ children: data.leaves } as any)
    .sum((d: any) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  d3.treemap<any>().tile(d3.treemapSquarify).size([width, height]).paddingInner(2)(root);

  const max = root.children?.[0]?.value ?? 1;
  // Single-hue sequential: these are parts of one magnitude.
  const ramp = d3.scaleSequential<string>().domain([0, max]).interpolator(d3.interpolate("#f4e6d6", "#b5652f"));

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  const cell = svg
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", (d: any) => `translate(${d.x0},${d.y0})`);

  cell
    .append("rect")
    .attr("width", (d: any) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d: any) => Math.max(0, d.y1 - d.y0))
    .attr("rx", 3)
    .style("fill", (d: any) => ramp(d.value))
    .style("stroke", "var(--bg-card)")
    .on("mousemove", (event, d: any) => {
      const [px, py] = d3.pointer(event, container as any);
      readout?.show(px, py, [d.data.label, data.format(d.value), d.data.note ?? ""].filter(Boolean));
    })
    .on("mouseleave", () => readout?.hide());

  /*
   * A label only goes inside a cell wide enough to hold it — a clipped label is worse than none.
   *
   * That rule was enforced against a fixed 46px cell width, which is not the same test: a 60px
   * cell cleared it and then drew "WELLINGTON MANAGEMENT GROUP" straight out of the tile, 163px
   * past the right edge of the chart and 146px past the card. SVG text does not clip to its
   * parent, so nothing hinted at it.
   *
   * The label is now MEASURED against the cell it has to sit in, and dropped when it does not
   * fit. Nothing is lost by dropping one: every cell carries the full name and value in its
   * <title> and in the hover readout.
   */
  const PAD = 6;
  const fitsCell = (sel: d3.Selection<SVGTextElement, unknown, null, undefined>, maxW: number) => {
    const node = sel.node();
    const w = node?.getComputedTextLength?.() ?? 0;
    if (w > maxW) {
      sel.remove();
      return false;
    }
    return true;
  };

  cell.each(function (d: any) {
    const w = d.x1 - d.x0;
    const h = d.y1 - d.y0;
    if (w < 46 || h < 24) return; // cheap pre-filter: too small for any label
    const g = d3.select(this);
    const inner = w - PAD * 2;
    const label = sans(g.append("text").attr("x", PAD).attr("y", 15).text(d.data.label), 11, 700).style(
      "fill",
      d.value > max * 0.55 ? "var(--bg-card)" : "var(--ink)",
    ) as unknown as d3.Selection<SVGTextElement, unknown, null, undefined>;
    // If the NAME does not fit, the value goes with it. A tile reading "369M SHARES" with no
    // manager against it is a magnitude nobody can attribute — worse than an unlabelled
    // rectangle, whose identity the hover readout and <title> still carry.
    if (!fitsCell(label, inner)) return;
    if (h > 38) {
      const val = mono(g.append("text").attr("x", PAD).attr("y", 29).text(data.format(d.value)), 9).style(
        "fill",
        d.value > max * 0.55 ? "rgba(255,255,255,.8)" : "var(--mono-muted)",
      ) as unknown as d3.Selection<SVGTextElement, unknown, null, undefined>;
      fitsCell(val, inner);
    }
  });

  cell.append("title").text((d: any) => `${d.data.label} — ${data.format(d.value)}`);
};

export function Treemap({
  leaves,
  format = (v) => String(Math.round(v)),
  height = 300,
  label,
}: {
  leaves: TreemapLeaf[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ leaves, format }), [leaves, format]);
  return <Chart draw={treemapDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- scatter

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  focal?: boolean;
}

const M = { top: 16, right: 18, bottom: 34, left: 52 };

const scatterDraw: DrawFn<{
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  parityLine?: boolean;
  format: (v: number) => string;
}> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
  if (!data.points.length) return;

  const xs = data.points.map((p) => p.x);
  const ys = data.points.map((p) => p.y);
  const dom: [number, number] = data.parityLine
    ? [Math.min(...xs, ...ys), Math.max(...xs, ...ys)]
    : [Math.min(...xs), Math.max(...xs)];
  const x = d3.scaleLinear().domain(dom).nice().range([0, iw]);
  const y = d3
    .scaleLinear()
    .domain(data.parityLine ? dom : [Math.min(...ys), Math.max(...ys)])
    .nice()
    .range([ih, 0]);

  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat((v) => data.format(v as number)) as any));
  // The origin tick belongs to the x axis only — emitting both stacks two labels in the corner.
  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-ih).tickFormat((v) => data.format(v as number)) as any),
  );

  mono(svg.append("text").attr("x", M.left).attr("y", height - 4).text(data.xLabel), 9);
  mono(
    svg
      .append("text")
      .attr("transform", `translate(11,${M.top + ih / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text(data.yLabel),
    9,
  );

  if (data.parityLine) {
    g.append("line")
      .attr("x1", x(dom[0]))
      .attr("y1", y(dom[0]))
      .attr("x2", x(dom[1]))
      .attr("y2", y(dom[1]))
      .style("stroke", "var(--border-strong)")
      .style("stroke-dasharray", "4 3");
    mono(g.append("text").attr("x", iw - 4).attr("y", y(dom[1]) + 14).attr("text-anchor", "end").text("parity"), 8.5);
  }

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  const dots = g
    .selectAll("circle")
    .data(data.points)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", (d) => (d.focal ? 5.2 : 3.4))
    .style("fill", "var(--ink-soft)")
    .style("fill-opacity", (d) => (d.focal ? 0.95 : 0.45));

  dots
    .filter((d) => !!d.focal)
    .style("fill", "var(--accent)")
    .style("stroke", "var(--bg-card)")
    .style("stroke-width", 1.4);

  dots
    .on("mousemove", (event, d) => {
      const [px, py] = d3.pointer(event, container as any);
      readout?.show(px, py, [d.label, `${data.xLabel} ${data.format(d.x)}`, `${data.yLabel} ${data.format(d.y)}`]);
    })
    .on("mouseleave", () => readout?.hide());

  dots.append("title").text((d) => `${d.label} — ${data.format(d.x)} / ${data.format(d.y)}`);

  // Candidate-offset label placement; a label that cannot clear its neighbours is DROPPED and
  // its value stays on the <title> tooltip (RECONCILIATION §6.3).
  const placed: Box[] = [];
  const ranked = [...data.points].sort((a, b) => Number(!!b.focal) - Number(!!a.focal));
  for (const p of ranked.slice(0, 14)) {
    const t = g.append("text").attr("opacity", 0).text(p.label);
    sans(t, 10, p.focal ? 700 : 500);
    const w = textWidth(t.node()) || p.label.length * 5.6;
    const spot = placeLabel(x(p.x), y(p.y), w, 11, placed, { width: iw, height: ih });
    if (!spot) {
      t.remove();
      continue;
    }
    placed.push(spot.box);
    t.attr("x", spot.x).attr("y", spot.y).attr("text-anchor", spot.anchor).attr("opacity", 1);
  }
};

export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  parityLine,
  format = (v) => String(Math.round(v * 10) / 10),
  height = 280,
  label,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  parityLine?: boolean;
  format?: (v: number) => string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(
    () => ({ points, xLabel, yLabel, parityLine, format }),
    [points, xLabel, yLabel, parityLine, format],
  );
  return <Chart draw={scatterDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- cohort heatmap

export interface CohortCell {
  row: string;
  col: string;
  value: number | null;
}

const cohortDraw: DrawFn<{
  rows: string[];
  cols: string[];
  cells: CohortCell[];
  format: (v: number) => string;
}> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  const left = labelGutter(svg, data.rows, 9, "mono", 84);
  const top = 22;
  const iw = width - left - 12;
  const ih = height - top - 12;
  const x = d3.scaleBand<string>().domain(data.cols).range([0, iw]).padding(0.06);
  const y = d3.scaleBand<string>().domain(data.rows).range([0, ih]).padding(0.06);
  const vals = data.cells.map((c) => c.value).filter((v): v is number => v != null);
  // SINGLE-HUE sequential only.
  const ramp = d3
    .scaleSequential<string>()
    .domain([Math.min(...vals, 0), Math.max(...vals, 1)])
    .interpolator(d3.interpolate("#f6efe4", "#a85f30"));

  const g = svg.append("g").attr("transform", `translate(${left},${top})`);
  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  g.selectAll("rect")
    .data(data.cells)
    .join("rect")
    .attr("x", (d) => x(d.col) ?? 0)
    .attr("y", (d) => y(d.row) ?? 0)
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 2)
    .style("fill", (d) => (d.value == null ? "var(--bg-tint)" : ramp(d.value)))
    .style("stroke", (d) => (d.value == null ? "var(--border)" : "none"))
    .style("stroke-dasharray", (d) => (d.value == null ? "2 2" : "none"))
    .on("mousemove", (event, d) => {
      const [px, py] = d3.pointer(event, container as any);
      readout?.show(px, py, [`${d.row} · ${d.col}`, d.value == null ? "no disclosure in this period" : data.format(d.value)]);
    })
    .on("mouseleave", () => readout?.hide())
    .append("title")
    .text((d) => `${d.row} · ${d.col} — ${d.value == null ? "not disclosed" : data.format(d.value)}`);

  data.rows.forEach((r) =>
    mono(
      svg
        .append("text")
        .attr("x", left - 8)
        .attr("y", top + (y(r) ?? 0) + y.bandwidth() / 2 + 3)
        .attr("text-anchor", "end")
        .text(r),
      9,
    ),
  );
  data.cols.forEach((c) =>
    mono(
      svg
        .append("text")
        .attr("x", left + (x(c) ?? 0) + x.bandwidth() / 2)
        .attr("y", top - 7)
        .attr("text-anchor", "middle")
        .text(c),
      8.5,
    ),
  );
};

export function CohortHeatmap({
  rows,
  cols,
  cells,
  format = (v) => String(Math.round(v)),
  height,
  label,
}: {
  rows: string[];
  cols: string[];
  cells: CohortCell[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ rows, cols, cells, format }), [rows, cols, cells, format]);
  return <Chart draw={cohortDraw} data={data} height={height ?? rows.length * 26 + 40} label={label} />;
}

// ---------------------------------------------------------------------------- dot calendar

export interface CalendarNotice {
  id: string;
  date: string;
  /** Encoded as AREA — hence scaleSqrt, never a radius scale. */
  size: number;
  label: string;
  /**
   * Filled vs hollow, for a binary property of the notice — on Form 144, whether it references a
   * Rule 10b5-1 plan.
   *
   * Fill, not hue: the distinction is categorical and carries no ordering, and spending a second
   * color here would read as one kind of notice being worse than the other. Defaults to filled.
   */
  filled?: boolean;
}

const calendarDraw: DrawFn<{
  notices: CalendarNotice[];
  format: (v: number) => string;
  magnitude: boolean;
}> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  const iw = width - 28;
  const ih = height - 34;
  const g = svg.append("g").attr("transform", "translate(14,10)");
  if (!data.notices.length) {
    mono(svg.append("text").attr("x", 14).attr("y", 22).text("no Form 144 notices in this window"));
    return;
  }
  const x = d3
    .scaleTime()
    .domain(d3.extent(data.notices, (n) => new Date(n.date)) as [Date, Date])
    .range([0, iw])
    .nice();
  // With no magnitude to encode, every dot is the SAME small radius. Running the size scale over
  // uniform values would map every notice to the MAXIMUM radius, so a calendar whose sizes we do
  // not know would read as a calendar of unusually large ones.
  const rScale = d3
    .scaleSqrt()
    .domain([0, d3.max(data.notices, (n) => n.size) ?? 1])
    .range([2, 13]);
  const r = (n: CalendarNotice) => (data.magnitude ? rScale(n.size) : 4);

  const xAxis = g
    .append("g")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 120))).tickSize(-ih) as any);
  gridStyle(xAxis);
  // A tick sitting on the domain edge centres its label half-outside the frame — "February"
  // was overhanging the left edge by 8px. Anchor the outermost labels inward instead.
  xAxis.selectAll<SVGTextElement, unknown>("text").each(function () {
    const cx = Number(this.parentElement?.getAttribute("transform")?.match(/translate\(([-\d.]+)/)?.[1] ?? 0);
    d3.select(this).attr("text-anchor", edgeAnchor(cx, iw));
  });

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  g.selectAll("circle")
    .data(data.notices)
    .join("circle")
    .attr("cx", (d) => x(new Date(d.date)))
    .attr("cy", (_d, i) => ih / 2 + ((i % 5) - 2) * 9)
    .attr("r", (d) => r(d))
    .style("fill", (d) => (d.filled === false ? "var(--bg-card)" : "var(--accent)"))
    .style("fill-opacity", (d) => (d.filled === false ? 1 : 0.45))
    .style("stroke", "var(--accent)")
    .style("stroke-width", 1)
    .on("mousemove", (event, d) => {
      const [px, py] = d3.pointer(event, container as any);
      readout?.show(
        px,
        py,
        data.magnitude ? [d.label, d.date, data.format(d.size)] : [d.label, d.date],
      );
    })
    .on("mouseleave", () => readout?.hide())
    .append("title")
    .text((d) =>
      data.magnitude ? `${d.label} — ${d.date} · ${data.format(d.size)}` : `${d.label} — ${d.date}`,
    );

  mono(
    svg
      .append("text")
      .attr("x", 14)
      .attr("y", height - 4)
      .text(data.magnitude ? "area ∝ shares noticed" : "one dot per notice · size not reported"),
    8.5,
  );
};

export function DotCalendar({
  notices,
  format = (v) => String(Math.round(v)),
  height = 160,
  label,
  magnitude = true,
}: {
  notices: CalendarNotice[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
  /** False when only the DATES are known. Dots then share one small radius and the caption
   *  stops claiming area encodes anything — see `calendarDraw`. */
  magnitude?: boolean;
}) {
  const data = useMemo(() => ({ notices, format, magnitude }), [notices, format, magnitude]);
  return <Chart draw={calendarDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- Lorenz curve

const lorenzDraw: DrawFn<{ shares: number[]; note?: string }> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
  const sorted = [...data.shares].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0) || 1;

  const pts: [number, number][] = [[0, 0]];
  let acc = 0;
  sorted.forEach((s, i) => {
    acc += s;
    pts.push([((i + 1) / sorted.length) * 100, (acc / total) * 100]);
  });

  const x = d3.scaleLinear().domain([0, 100]).range([0, iw]);
  const y = d3.scaleLinear().domain([0, 100]).range([ih, 0]);
  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat((v) => `${v}%`) as any));
  gridStyle(
    g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(4).tickFormat((v) => `${v}%`) as any),
  );

  g.append("line")
    .attr("x1", x(0))
    .attr("y1", y(0))
    .attr("x2", x(100))
    .attr("y2", y(100))
    .style("stroke", "var(--border-strong)")
    .style("stroke-dasharray", "4 3");

  g.append("path")
    .datum(pts)
    .attr(
      "d",
      d3
        .line<[number, number]>()
        .x((p) => x(p[0]))
        .y((p) => y(p[1])),
    )
    .attr("fill", "none")
    .style("stroke", "var(--accent)")
    .style("stroke-width", 1.8);

  // Invisible hit targets on the curve: the Lorenz line has no marks of its own, but a reader
  // still needs to ask "what does the top 20% hold?" and get an answer.
  const hits = g
    .selectAll<SVGCircleElement, [number, number]>("circle.lz")
    .data(pts)
    .join("circle")
    .attr("class", "lz")
    .attr("cx", (p) => x(p[0]))
    .attr("cy", (p) => y(p[1]))
    .attr("r", 5)
    .style("fill", "var(--accent)")
    .style("fill-opacity", 0);
  attachReadout(hits, container, (p) => [
    `${p[0].toFixed(0)}% of holders`,
    `hold ${p[1].toFixed(1)}% of reported shares`,
  ]);
  hits
    .on("mouseenter", function () {
      d3.select(this).style("fill-opacity", 0.9);
    })
    .on("mouseout", function () {
      d3.select(this).style("fill-opacity", 0);
    });

  mono(svg.append("text").attr("x", M.left).attr("y", height - 3).text("share of holders →"), 8.5);
};

export function LorenzChart({ shares, height = 240, label }: { shares: number[]; height?: number; label?: string }) {
  const data = useMemo(() => ({ shares }), [shares]);
  return <Chart draw={lorenzDraw} data={data} height={height} label={label} />;
}

// ---------------------------------------------------------------------------- log dots

export interface LogDotRow {
  key: string;
  label: string;
  a: number;
  b: number;
}

/** Paired dots on a shared LOG axis — for figures spanning orders of magnitude. Prints the ratio. */
const logDotsDraw: DrawFn<{
  rows: LogDotRow[];
  aLabel: string;
  bLabel: string;
  format: (v: number) => string;
}> = (svg, { d3, width, height, data }) => {
  svg.selectAll("*").remove();
  // Measured, not assumed — see `widestLabel`. Only ever grows from the design's 118px.
  const left = Math.max(
    118,
    Math.ceil(widestLabel(svg, data.rows.map((r) => r.label), (t) => sans(t, 10.5, 500))) + 12,
  );
  const iw = width - left - 62;
  const ih = height - 30;
  const g = svg.append("g").attr("transform", `translate(${left},8)`);
  const all = data.rows.flatMap((r) => [r.a, r.b]).filter((v) => v > 0);
  if (!all.length) return;
  const x = d3.scaleLog().domain([Math.min(...all) * 0.7, Math.max(...all) * 1.4]).range([0, iw]);
  const y = d3.scaleBand<string>().domain(data.rows.map((r) => r.key)).range([0, ih]).padding(0.42);

  gridStyle(
    g
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(4, "~s").tickSize(-ih) as any),
  );

  for (const r of data.rows) {
    const cy = (y(r.key) ?? 0) + y.bandwidth() / 2;
    sans(svg.append("text").attr("x", left - 10).attr("y", cy + 11.5).attr("text-anchor", "end").text(r.label), 10.5, 500);
    g.append("line")
      .attr("x1", x(Math.max(1e-9, r.a)))
      .attr("x2", x(Math.max(1e-9, r.b)))
      .attr("y1", cy)
      .attr("y2", cy)
      .style("stroke", "var(--border-strong)")
      .style("stroke-width", 1.6);
    g.append("circle").attr("cx", x(Math.max(1e-9, r.a))).attr("cy", cy).attr("r", 4).style("fill", "var(--accent)");
    g.append("circle")
      .attr("cx", x(Math.max(1e-9, r.b)))
      .attr("cy", cy)
      .attr("r", 4)
      .style("fill", "var(--bg-card)")
      .style("stroke", "var(--gaap-color)")
      .style("stroke-width", 1.6);
    mono(
      g
        .append("text")
        .attr("x", iw + 8)
        .attr("y", cy + 3.5)
        .text(`${Math.round((r.b / (r.a || 1)) * 10) / 10}×`),
      9,
    );
  }

  const lg = svg.append("g").attr("transform", `translate(${left},${height - 6})`);
  lg.append("circle").attr("cx", 4).attr("cy", -4).attr("r", 4).style("fill", "var(--accent)");
  mono(lg.append("text").attr("x", 13).attr("y", -1).text(data.aLabel), 8.5);
  lg.append("circle")
    .attr("cx", 13 + data.aLabel.length * 5.6 + 14)
    .attr("cy", -4)
    .attr("r", 4)
    .style("fill", "var(--bg-card)")
    .style("stroke", "var(--gaap-color)")
    .style("stroke-width", 1.6);
  mono(
    lg
      .append("text")
      .attr("x", 13 + data.aLabel.length * 5.6 + 23)
      .attr("y", -1)
      .text(data.bLabel),
    8.5,
  );
};

export function LogDots({
  rows,
  aLabel,
  bLabel,
  format = (v) => String(Math.round(v)),
  label,
}: {
  rows: LogDotRow[];
  aLabel: string;
  bLabel: string;
  format?: (v: number) => string;
  label?: string;
}) {
  const data = useMemo(() => ({ rows, aLabel, bLabel, format }), [rows, aLabel, bLabel, format]);
  return <Chart draw={logDotsDraw} data={data} height={Math.max(100, rows.length * 28 + 34)} label={label} />;
}

// ---------------------------------------------------------------------------- UpSet

export interface UpsetSet {
  key: string;
  label: string;
}

export interface UpsetCombo {
  /** Which sets this intersection consists of. Empty = "none of them". */
  members: string[];
  size: number;
  note?: string;
}

/**
 * UpSet set-intersection plot: bars for intersection size over a dot matrix of membership.
 *
 * A Venn diagram stops working past three sets and a prose label ("A + B + C") stops scanning
 * past two. The matrix is the point — it shows WHICH sets each bar consists of, at any number
 * of them. No library: d3 scales plus a hand-drawn dot matrix (RECONCILIATION §5b).
 */
const upsetDraw: DrawFn<{
  sets: UpsetSet[];
  combos: UpsetCombo[];
  format: (v: number) => string;
}> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  if (!data.combos.length) return;

  const left = labelGutter(svg, data.sets.map((s) => s.label), 10.5, "sans", 120);
  const rowH = 17;
  const matrixH = data.sets.length * rowH + 8;
  const barsH = Math.max(60, height - matrixH - 30);
  const iw = width - left - 58;

  const x = d3
    .scaleBand<number>()
    .domain(data.combos.map((_c, i) => i))
    .range([0, iw])
    .padding(0.3);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data.combos, (c) => c.size) ?? 1])
    .nice()
    .range([barsH, 0]);
  const yr = d3
    .scaleBand<string>()
    .domain(data.sets.map((s) => s.key))
    .range([0, data.sets.length * rowH])
    .padding(0.22);

  const g = svg.append("g").attr("transform", `translate(${left},8)`);
  gridStyle(g.append("g").call(d3.axisLeft(y).ticks(3).tickSize(-iw).tickFormat((v) => data.format(v as number)) as any));

  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  const bars = g
    .selectAll("rect.up")
    .data(data.combos)
    .join("rect")
    .attr("class", "up")
    .attr("x", (_c, i) => x(i) ?? 0)
    .attr("width", x.bandwidth())
    .attr("y", (c) => y(c.size))
    .attr("height", (c) => barsH - y(c.size))
    .style("fill", "var(--accent)")
    .style("fill-opacity", 0.62);

  attachReadout(bars, container, (c: UpsetCombo) => [
    c.members.length ? c.members.join(" + ") : "none of the named managers",
    data.format(c.size),
    c.note ?? "",
  ].filter(Boolean) as string[]);

  // The membership matrix, under the bars.
  const m = svg.append("g").attr("transform", `translate(${left},${barsH + 22})`);
  data.sets.forEach((s) => {
    const cy = (yr(s.key) ?? 0) + yr.bandwidth() / 2;
    m.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", cy)
      .attr("y2", cy)
      .style("stroke", "var(--border)")
      .style("stroke-width", 1);
    sans(
      svg
        .append("text")
        .attr("x", left - 10)
        .attr("y", barsH + 22 + cy + 3.5)
        .attr("text-anchor", "end")
        .text(s.label),
      10.5,
      500,
    );
  });

  data.combos.forEach((c, i) => {
    const cx = (x(i) ?? 0) + x.bandwidth() / 2;
    const ys = c.members
      .map((k) => (yr(k) ?? 0) + yr.bandwidth() / 2)
      .sort((a, b) => a - b);
    // The connector is what makes a combination read as one thing rather than three dots.
    if (ys.length > 1) {
      m.append("line")
        .attr("x1", cx)
        .attr("x2", cx)
        .attr("y1", ys[0])
        .attr("y2", ys[ys.length - 1])
        .style("stroke", "var(--accent)")
        .style("stroke-width", 1.6);
    }
    data.sets.forEach((s) => {
      const on = c.members.includes(s.key);
      m.append("circle")
        .attr("cx", cx)
        .attr("cy", (yr(s.key) ?? 0) + yr.bandwidth() / 2)
        .attr("r", 4.2)
        .style("fill", on ? "var(--accent)" : "var(--bg-tint)")
        .style("stroke", on ? "none" : "var(--border-tint)");
    });
  });
};

export function UpsetChart({
  sets,
  combos,
  format = (v) => String(Math.round(v)),
  height,
  label,
}: {
  sets: UpsetSet[];
  combos: UpsetCombo[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ sets, combos, format }), [sets, combos, format]);
  return <Chart draw={upsetDraw} data={data} height={height ?? 150 + sets.length * 17} label={label} />;
}

// ---------------------------------------------------------------------------- adjacency matrix

export interface MatrixCell {
  row: string;
  col: string;
  value: number | null;
}

/**
 * Peer adjacency matrix — managers × issuers, single-hue sequential.
 *
 * SINGLE HUE on purpose: the cell encodes one magnitude (how much of that issuer the manager
 * reports), and a diverging or categorical ramp would imply a midpoint or a category that the
 * data does not have. A cell with no filing is hatched, not zero-filled.
 */
const matrixDraw: DrawFn<{
  rows: string[];
  cols: string[];
  cells: MatrixCell[];
  format: (v: number) => string;
}> = (svg, { d3, width, height, data, container }) => {
  svg.selectAll("*").remove();
  container?.querySelectorAll(".chart-readout").forEach((n) => n.remove());
  const left = labelGutter(svg, data.rows, 10.5, "sans", 150);
  const top = 30;
  const iw = width - left - 12;
  const ih = height - top - 12;
  const x = d3.scaleBand<string>().domain(data.cols).range([0, iw]).padding(0.08);
  const y = d3.scaleBand<string>().domain(data.rows).range([0, ih]).padding(0.08);
  const vals = data.cells.map((c) => c.value).filter((v): v is number => v != null);
  const ramp = d3
    .scaleSequential<string>()
    .domain([Math.min(...vals, 0), Math.max(...vals, 1)])
    .interpolator(d3.interpolate("#f6efe4", "#a85f30"));

  const g = svg.append("g").attr("transform", `translate(${left},${top})`);
  const readout = container ? makeReadout(container) : null;
  readout?.hide();

  const cells = g
    .selectAll("rect")
    .data(data.cells)
    .join("rect")
    .attr("x", (c) => x(c.col) ?? 0)
    .attr("y", (c) => y(c.row) ?? 0)
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 2)
    .style("fill", (c) => (c.value == null ? "var(--bg-tint)" : ramp(c.value)))
    .style("stroke", (c) => (c.value == null ? "var(--border)" : "none"))
    .style("stroke-dasharray", (c) => (c.value == null ? "2 2" : "none"));

  attachReadout(cells, container, (c: MatrixCell) => [
    `${c.row} · ${c.col}`,
    c.value == null ? "no position reported" : data.format(c.value),
  ]);

  data.rows.forEach((r) =>
    sans(
      svg
        .append("text")
        .attr("x", left - 9)
        .attr("y", top + (y(r) ?? 0) + y.bandwidth() / 2 + 3.5)
        .attr("text-anchor", "end")
        .text(r),
      10.5,
      500,
    ),
  );
  data.cols.forEach((c) =>
    mono(
      svg
        .append("text")
        .attr("x", left + (x(c) ?? 0) + x.bandwidth() / 2)
        .attr("y", top - 9)
        .attr("text-anchor", "middle")
        .text(c),
      8.5,
    ),
  );
};

export function MatrixChart({
  rows,
  cols,
  cells,
  format = (v) => String(Math.round(v)),
  height,
  label,
}: {
  rows: string[];
  cols: string[];
  cells: MatrixCell[];
  format?: (v: number) => string;
  height?: number;
  label?: string;
}) {
  const data = useMemo(() => ({ rows, cols, cells, format }), [rows, cols, cells, format]);
  return <Chart draw={matrixDraw} data={data} height={height ?? rows.length * 22 + 46} label={label} />;
}
