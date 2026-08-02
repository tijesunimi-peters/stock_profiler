/**
 * Company Hub → Financial history, ported from the prototype.
 *
 * The whole XBRL fact history, any metric, any period on file: a grouped picker on the left
 * (grouped by the STATEMENT the fact comes from, not by topic), and one overlay chart on the
 * right that takes up to three metrics.
 *
 * Three is a real ceiling, not a styling choice — a fourth line on a shared axis stops being
 * readable, and the picker says so rather than silently ignoring the click.
 */
import { useState } from "react";
import { metricDefs, seriesFor, unitFmt } from "../../data/hub";
import { SECTOR_NAMES } from "../../data/prototype";
import { FILER_BY_SYMBOL } from "../../data/catalog";
import { SeriesChart } from "../../charts/series";
import { useSelection } from "../../state";

/** Colour per SELECTION SLOT — identity of the pick, never a verdict on the metric. */
const SLOT_COLORS = ["var(--accent)", "var(--gaap-color)", "#A88C5F"];

const RANGE_TABS = [
  ["8q", "8 quarters"],
  ["20q", "20 quarters"],
  ["5y", "5 fiscal years"],
] as const;

const BASIS_TABS = [
  ["filed", "As filed"],
  ["restated", "As restated"],
] as const;

export function HistoryView() {
  const sel = useSelection();
  const T = sel.focal;
  const [picked, setPicked] = useState<string[]>(["rev"]);
  const [range, setRange] = useState<"8q" | "20q" | "5y">("20q");
  const [basis, setBasis] = useState<"filed" | "restated">("filed");
  const [zoom, setZoom] = useState(false);

  const defs = metricDefs(T);
  const series = picked
    .map((id, i) => ({ id, color: SLOT_COLORS[i % SLOT_COLORS.length], s: seriesFor(T, id, range, basis) }))
    .filter((x): x is { id: string; color: string; s: NonNullable<ReturnType<typeof seriesFor>> } => !!x.s);

  const groups: { name: string; items: typeof defs }[] = [];
  for (const m of defs) {
    let g = groups.find((x) => x.name === m.group);
    if (!g) {
      g = { name: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  const toggle = (id: string) =>
    setPicked((x) => (x.includes(id) ? (x.length > 1 ? x.filter((k) => k !== id) : x) : x.length >= 3 ? x : [...x, id]));

  const primary = series[0]?.s;
  const units = Array.from(new Set(series.map((x) => x.s.unit)));
  const all = series.flatMap((x) => x.s.vals.filter((v): v is number => v != null).map(Math.abs));
  const fmt = unitFmt(units[0], all.length ? Math.max(...all) : undefined);
  const shown = primary ? primary.vals.filter((v): v is number => v != null) : [];
  const title = series.length === 1 ? primary?.label : `${series.length} metrics compared`;

  const chartSeries = series.map((x) => ({
    id: x.id,
    label: x.s.label,
    color: x.color,
    points: x.s.labels.map((p, i) => ({ period: p, value: x.s.vals[i] })),
  }));

  return (
    <div className="hub">
      <div className="hub-crumb">
        <span className="hub-crumb-sector">{SECTOR_NAMES[sel.sectorIdx]}</span>
        <span className="hub-crumb-sep">›</span>
        <span className="hub-crumb-name">{FILER_BY_SYMBOL[T]?.name ?? T}</span>
        <span className="hub-crumb-ticker">{T}</span>
        <span className="hist-crumb-view">Financial history</span>
        <span className="hub-crumb-spacer" />
        <span className="hub-hint">full XBRL fact history · any metric, any period on file</span>
      </div>

      {zoom && primary && (
        <div className="hist-zoom" role="dialog" aria-label={`${title} — expanded`}>
          <div className="hist-zoom-panel">
            <div className="hist-zoom-head">
              <div className="hub-drawer-title">
                <span className="hub-panel-title">{title}</span>
                <span className="hub-hint">
                  {shown.length} of {primary.vals.length} periods disclosed
                </span>
              </div>
              <button type="button" className="hub-tab" onClick={() => setZoom(false)}>
                Close
              </button>
            </div>
            {/* Re-authored at the overlay's width rather than scaling the inline copy up —
                scaling would shrink every label below the legible floor. */}
            <SeriesChart series={chartSeries} format={fmt} legend={series.length > 1} height={460} label={`${title} expanded`} />
          </div>
        </div>
      )}

      {/* The picker is a full-width band ABOVE the chart, not a sidebar beside it: the groups
          wrap inline, so the whole 25-metric catalogue is visible at once without a second
          scroll region competing with the page's. */}
      <div className="hist-picker">
        <div className="hist-picker-row">
          <span className="hist-picker-label">
            Metrics <span className="hist-picker-hint">— click to overlay, up to three</span>
          </span>
          {groups.map((g) => (
            <div className="hist-group" key={g.name}>
              <span className="hist-group-name">{g.name}</span>
              {g.items.map((m) => {
                  const at = picked.indexOf(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`hist-pick${at >= 0 ? " is-on" : ""}`}
                      style={
                        at >= 0
                          ? {
                              background: SLOT_COLORS[at % SLOT_COLORS.length],
                              borderColor: SLOT_COLORS[at % SLOT_COLORS.length],
                            }
                          : undefined
                      }
                      onClick={() => toggle(m.id)}
                    >
                      {m.label}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div className="p-card hist-chart">
          <div className="hist-chart-head">
            <div className="hist-legend">
              <span className="hub-panel-title">{title}</span>
              {series.map((x) => {
                const vals = x.s.vals.filter((v): v is number => v != null);
                const f = unitFmt(x.s.unit, vals.length ? Math.max(...vals.map(Math.abs)) : undefined);
                return (
                  <span className="hist-legend-chip" key={x.id}>
                    <span className="hist-legend-swatch" style={{ background: x.color }} />
                    {x.s.label}
                    <b>{vals.length ? f(vals[vals.length - 1]) : "not disclosed"}</b>
                    {picked.length > 1 && (
                      <button type="button" title="Remove from chart" onClick={() => toggle(x.id)}>
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="hub-tabs is-sm">
              {RANGE_TABS.map(([k, l]) => (
                <button key={k} type="button" className={`hub-tab is-sm${range === k ? " is-active" : ""}`} onClick={() => setRange(k)}>
                  {l}
                </button>
              ))}
              <span className="hub-tab-sep" />
              {BASIS_TABS.map(([k, l]) => (
                <button key={k} type="button" className={`hub-tab is-sm${basis === k ? " is-active" : ""}`} onClick={() => setBasis(k)}>
                  {l}
                </button>
              ))}
              <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setZoom(true)}>
                ⤡ Expand
              </button>
            </div>
          </div>

          <SeriesChart series={chartSeries} format={fmt} legend={series.length > 1} height={330} label={title} />

          <div className="hub-drawer-notes">
            {series.length === 1 && shown.length > 0 && (
              <span>
                Range low {fmt(Math.min(...shown))} · high {fmt(Math.max(...shown))}
              </span>
            )}
            {/* Per SERIES, not just the primary: with three metrics overlaid, a line that breaks
                because that metric was not disclosed must say so — otherwise only the first
                metric's coverage is ever reported and the other two break silently. */}
            {series.map((x) => {
              const n = x.s.vals.filter((v) => v != null).length;
              return (
                <span key={x.id}>
                  {series.length > 1 ? `${x.s.label}: ` : ""}
                  {n} of {x.s.vals.length} periods disclosed
                </span>
              );
            })}
            {units.length > 1 && (
              <span>Mixed units ({units.join(", ")}) share one axis — read shape, not level.</span>
            )}
            <span>
              {picked.length < 3
                ? "Select up to three metrics to overlay."
                : "Three metrics is the maximum — deselect one to add another."}
            </span>
          <span>Dashed markers flag filing events that affect comparability.</span>
        </div>
      </div>
    </div>
  );
}
