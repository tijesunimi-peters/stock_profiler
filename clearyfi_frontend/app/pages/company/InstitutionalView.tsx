/**
 * Company Hub → Institutional ownership. Five numbered sections, per the prototype.
 *
 * NO MARKET VALUES anywhere. 13F dollar columns are market-priced, and this product carries no
 * market data — so composition is expressed in POSITIONS and in each issuer's shares
 * outstanding. That constraint is why this view looks the way it does.
 */
import { useState } from "react";
import { ChartCard, Disclosure, StateBlock, StatTile, StatTileRow, STANDARD_DISCLOSURES } from "@ds";
import { INST_HEADS, edgarLink, INST_GLOSSARY, type Calc } from "../../data/hub-catalog";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { SECTOR_NAMES } from "../../data/sector-catalog";
import { FILER_BY_SYMBOL } from "../../data/catalog";
import { compact, humanDate } from "../../lib/format";
import { CompositionStrip } from "@ds";
import { SeriesChart, Sparkline, StackedAreaChart, StepChart } from "../../charts/series";
import { CohortHeatmap, LorenzChart, MatrixChart, Treemap, UpsetChart } from "../../charts/misc";
import { DivergeChart, DumbbellChart, EventStrip, GanttChart, Histogram, ParetoChart } from "../../charts/bars";
import { PctBar, StackedBar } from "../../ui/primitives";
import { useSelection } from "../../state";
import { navigate } from "../../router";

/**
 * The arithmetic behind a derived figure, opened in place.
 *
 * Every derived number on this page has one. A concentration measure or an adjusted register
 * whose formula is not openable is an assertion, and the whole view is a bet on the difference.
 */
function HowComputed({ calc }: { calc: Calc }) {
  return (
    <div className="inst-calc">
      <div className="hub-label">How this is computed</div>
      <div className="inst-calc-formula">{calc.formula}</div>
      {calc.inputs.map((i) => (
        <div className="inst-calc-row" key={i.k}>
          <span className="hub-cell">{i.k}</span>
          <span className="hub-note inst-calc-v">{i.v}</span>
        </div>
      ))}
      <div className="hub-note">{calc.note}</div>
    </div>
  );
}

/** A figure's trend drawer: the same shape as the hub's, at register scale. */
function FigDrawer({
  title,
  series,
  note,
  format = (v: number) => `${v.toFixed(1)}%`,
}: {
  title: string;
  series: { period: string; value: number }[];
  note: string;
  format?: (v: number) => string;
}) {
  const latest = series[series.length - 1]?.value ?? 0;
  const change = latest - (series[0]?.value ?? 0);
  return (
    <div className="hub-drawer">
      <div className="hub-drawer-title">
        <span className="hub-panel-title is-sm">{title}</span>
        <span className="hub-cell-mono">{format(latest)}</span>
        <span className="hub-cell-mono is-soft">
          {change >= 0 ? "↑ +" : "↓ −"}
          {format(Math.abs(change))} over five years
        </span>
      </div>
      <SeriesChart
        series={[{ id: title, label: title, kind: "focal", points: series }]}
        format={format}
        area
        height={150}
        label={title}
      />
      <div className="hub-drawer-notes">
        <span>{note}</span>
      </div>
    </div>
  );
}

/** The register's section header: ordinal, title, and the source line inline. */
function InstHead({ id }: { id: string }) {
  const h = INST_HEADS.find((x) => x.id === id)!;
  return (
    <div className="hub-head" id={h.id}>
      <span className="hub-head-n">{h.n}</span>
      <span className="hub-head-title">{h.title}</span>
      <span className="hub-head-src">{h.src}</span>
    </div>
  );
}

/*
 * The two period vocabularies this view speaks.
 *
 * Constants for now — the app carries no real period state (`state.tsx` pins a shim). Named so
 * Phase A has one place to thread the reader's selection through, and so it stays visible that a
 * 13F quarter-end is a CALENDAR date while the series endpoints take a lookback COUNT. Neither is
 * the `(year, FiscalPeriod)` pair the financial statements use.
 */
const INST_QUARTER_END = "2026-03-31";
const INST_QUARTERS = 9;

/*
 * No props.
 *
 * It used to take `surface: CompanyInstitutionalSurface` from the seam AND call eight `inst*()`
 * builders directly — two independently-seeded fixtures describing the SAME register. The value
 * derived from the prop (`reported`) was never rendered, so removing it changes nothing on screen;
 * what it removes is the standing ability for one view to contradict itself, which is precisely
 * what `surfaces.ts`'s own header forbids ("no two views can disagree about the same fact").
 */
export function InstitutionalView() {
  const sel = useSelection();
  const T = sel.focal;

  /*
   * Six reads, mapped onto endpoints that ALREADY SHIP (V3-P5a, operator-accepted 2026-08-01), so
   * these boundaries are the backend's rather than ones invented here. Note the two period
   * vocabularies: a 13F QUARTER-END for point-in-time reads, a LOOKBACK COUNT for the series ones.
   * They are not interchangeable — see `data/api.ts`.
   */
  const snapshotRead = useApi(() => api.instRegisterSnapshot(T), [T]);
  const seriesRead = useApi(() => api.instRegisterSeries(T, INST_QUARTERS), [T]);
  const flowsRead = useApi(() => api.instFlows(T), [T]);
  const behaviourRead = useApi(() => api.instBehaviour(T), [T]);
  const stewardRead = useApi(() => api.instStewardship(T), [T]);
  const limitsRead = useApi(() => api.instLimits(T), [T]);

  const [openCalc, setOpenCalc] = useState<string | null>(null);
  const [formsOpen, setFormsOpen] = useState(false);
  const cik = FILER_BY_SYMBOL[sel.focal]?.cik ?? 0;
  // One overlay for both expandable charts in this section — same pattern as Financial history.
  const [zoom, setZoom] = useState<null | "register" | "mgrGrid" | "flow" | "pareto" | "tree" | "upset">(null);
  const [holdView, setHoldView] = useState<"ranked" | "treemap">("ranked");
  const [overlapView, setOverlapView] = useState<"combos" | "peers">("combos");
  const [flowsOpen, setFlowsOpen] = useState(false);
  const [stewOpen, setStewOpen] = useState(false);
  const [stripZoom, setStripZoom] = useState(false);
  const [behOpen, setBehOpen] = useState(false);
  const [cohortZoom, setCohortZoom] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [ganttZoom, setGanttZoom] = useState(false);
  const [holdersOpen, setHoldersOpen] = useState(false);

  // Gate after every hook. See the note in HubOverview: per-section paint is a Phase A decision,
  // where the latency is real enough to measure.
  const reads = [snapshotRead, seriesRead, flowsRead, behaviourRead, stewardRead, limitsRead];
  const failed = reads.find((r) => r.error);
  if (failed) return <StateBlock variant="error" copy={failed.error!.message} />;
  if (!snapshotRead.data || !seriesRead.data || !flowsRead.data || !behaviourRead.data || !stewardRead.data || !limitsRead.data) {
    return <StateBlock variant="loading" copy="Reading this issuer's 13F register." />;
  }

  const f = snapshotRead.data.freshness;
  const snap = snapshotRead.data.snapshot;
  // §02's drawers travel with §02's data, not §01's — their inputs are the per-quarter register
  // reads that section makes.
  const ext = seriesRead.data.extras;
  const reg = seriesRead.data.register;
  const flows = flowsRead.data.flows;
  const stew = stewardRead.data.steward;
  const beh = behaviourRead.data.behavior;
  const lim = limitsRead.data.limits;

  return (
    <div className="hub">
      <div className="hub-crumb">
        <span className="hub-crumb-sector">{SECTOR_NAMES[sel.sectorIdx]}</span>
        <span className="hub-crumb-sep">›</span>
        <span className="hub-crumb-name">{FILER_BY_SYMBOL[sel.focal]?.name ?? sel.focal}</span>
        <span className="hub-crumb-ticker">{sel.focal}</span>
        <span className="hist-crumb-view">Institutional ownership</span>
        <span className="hub-crumb-spacer" />
        <span className="inst-crumb-meta">
          {/* The scope line names the SOURCES and the one thing this view refuses to carry. */}
          <span className="hub-hint">
            13F-HR · SC 13D/G · DEF 14A · share counts only, no market values
          </span>
          <a className="inst-link" href={edgarLink(cik, "13F-HR")} target="_blank" rel="noopener">
            13F filings mentioning {sel.focal} ↗
          </a>
          <a className="inst-link" href={edgarLink(cik, "DEF 14A")} target="_blank" rel="noopener">
            Proxy ↗
          </a>
        </span>
      </div>
      <section className="hub-sec">
        <InstHead id="i1" />

        {/* Freshness first: everything below inherits the age of this snapshot. */}
        <div className="inst-fresh">
          <div className="inst-fresh-cell">
            <span className="hub-label no-mb">Register as of</span>
            <span className="inst-fresh-value">{f.asOfQtr}</span>
            <span className="hub-hint">
              filed {f.filedOn} · {f.age}
            </span>
          </div>
          <span className="inst-fresh-sep" />
          <div className="inst-fresh-cell">
            <span className="hub-label no-mb">Next 13F window closes</span>
            <span className="inst-fresh-value">{f.nextClose}</span>
            <span className="hub-hint">in {f.daysToNext}</span>
          </div>
          <span className="inst-fresh-sep" />
          <div className="inst-fresh-cell">
            <span className="hub-label no-mb">Filings since the snapshot</span>
            <span className="inst-fresh-value">{f.deltaCount}</span>
            <span className="hub-hint">faster forms applied below</span>
          </div>
          <span className="inst-fresh-sep" />
          <div className="inst-fresh-cell">
            <span className="hub-label no-mb">Confirmed in last 30 days</span>
            <span className="inst-fresh-value">{f.confirmed}</span>
            <span className="hub-hint">{f.confirmedNote}</span>
          </div>
        </div>
        <div className="inst-fresh-foot">
          <span>{f.lag}</span>
          <span>{f.scope}</span>
        </div>

        {/* Faster forms arrive between 13F windows. They are applied to a SEPARATE adjusted
            register rather than folded into the base, because mixing a quarter-end snapshot
            with later point-in-time filings produces a number no single form states. */}
        <div className="p-card inst-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Since the last 13F</span>
            <span className="hub-hint">
              faster forms, by EDGAR acceptance time · base and adjusted shown separately
            </span>
            <button
              type="button"
              className="hub-tab is-sm"
              onClick={() => setOpenCalc((c) => (c === "adjusted" ? null : "adjusted"))}
            >
              ƒ how this is computed
            </button>
          </div>

          <div className="inst-arith">
            <div className="inst-arith-cell">
              <span className="hub-label no-mb">Base register</span>
              <span className="inst-fresh-value">{snap.adjusted.base}</span>
              <span className="hub-hint">{snap.adjusted.baseLabel}</span>
            </div>
            <span className="inst-arith-op">+</span>
            <div className="inst-arith-cell">
              <span className="hub-label no-mb">Filed since</span>
              <span className="inst-fresh-value">{snap.adjusted.net}</span>
              <span className="hub-hint">
                {snap.adjusted.appliedCount} of {snap.adjusted.deltaCount} filings applied
              </span>
            </div>
            <span className="inst-arith-op">=</span>
            <div className="inst-arith-cell">
              <span className="hub-label no-mb">Adjusted register</span>
              <span className="inst-fresh-value">{snap.adjusted.value}</span>
              <span className="hub-hint">{snap.adjusted.pct}</span>
            </div>
          </div>

          <div className="hub-label inst-mt">Where the register moved · prior quarter to current</div>
          <DumbbellChart
            rows={snap.moved.map((m) => ({ key: m.key, label: m.label, prior: m.prior, current: m.current }))}
            format={(v) => `${Math.round(v)}M`}
            label="Register movement, prior quarter to current"
          />
          <div className="hub-note">
            Hollow is the position as reported in the prior quarter&apos;s 13F, filled the current
            register. Direction is described, not scored.
            {snap.movedNote ? ` ${snap.movedNote}` : ""}
          </div>

          <div className="inst-more">
            <button type="button" className="hub-tab" onClick={() => setFormsOpen((o) => !o)}>
              {formsOpen ? "− hide the filings" : `+ show the ${snap.adjusted.deltaCount} filings since`}
            </button>
            <span className="hub-hint">form, filer, what changed, share count and acceptance time</span>
          </div>

          {formsOpen && (
            <>
              <div className="hub-table-head inst-forms-grid">
                <span>Form</span>
                <span>Filer · what changed</span>
                <span className="ta-r">Shares</span>
                <span className="ta-r">Accepted</span>
              </div>
              {snap.deltaForms.map((d, i) => (
                <div className="inst-forms-grid hub-row" key={`${d.form}${i}`}>
                  <span className="form-badge">{d.form}</span>
                  <span className="hub-cell">
                    <span className="row-title">
                      {d.who} · {d.what}
                    </span>
                    <div className="row-sub">
                      deadline: {d.lagRule} · {d.applied}
                    </div>
                  </span>
                  <span className="hub-cell-mono ta-r">{d.shares}</span>
                  <span className="hub-cell-mono ta-r is-soft">{d.accepted}</span>
                </div>
              ))}
              <div className="hub-note">{snap.adjusted.note}</div>
            </>
          )}

          {openCalc === "adjusted" && <HowComputed calc={snap.adjustedCalc} />}

          <div className="hub-label inst-mt">How fast each form arrives</div>
          {snap.cadence.map((c) => (
            <div className="inst-cadence-row" key={c.form}>
              <span className="hub-cell-mono">{c.form}</span>
              <span className="hub-cell-mono is-soft">{c.rule}</span>
              <span className="hub-cell">{c.role}</span>
            </div>
          ))}
        </div>

        <div className="inst-figs">
          {snap.figs.map((fig) => (
            <button
              key={fig.id}
              type="button"
              className={`inst-fig${openCalc === fig.id ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === fig.id ? null : fig.id))}
            >
              <span className="hub-label no-mb">{fig.label}</span>
              <span className="inst-fig-value">{fig.value}</span>
              <span className="hub-hint">{fig.sub}</span>
            </button>
          ))}
        </div>
        {/* The drawer belongs to the ROW, not to the tile: a formula and its inputs need the
            full width, and inside a ~200px grid column the input table overflows its own cell. */}
        {snap.figs.find((f) => f.id === openCalc) && (
          <HowComputed calc={snap.figs.find((f) => f.id === openCalc)!.calc} />
        )}
        {/* Without this line a reader takes the proxy ownership table for trading activity. */}
        <div className="hub-note">
          The three figures above do NOT add up and are not exhaustive: a holder above 5% files
          both a 13F and a Schedule 13D/G, and a 10% owner is also an insider, so the same shares
          appear in more than one row. &ldquo;Insider &amp; affiliate&rdquo; is Forms 3/4/5, not the
          DEF 14A beneficial-ownership table — that table is tagged in no structured source.
          Section 16 transactions are reported in full on their own view.
        </div>
      </section>

      <section className="hub-sec">
        <InstHead id="i2" />

        <div className="inst-split">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Register over time</span>
              <span className="hub-hint">
                holder count and reported shares, {reg.quarters.length} quarters
              </span>
              <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setZoom("register")}>
                ⤡ Expand
              </button>
              <a className="inst-link" href={edgarLink(cik, "13F-HR")} target="_blank" rel="noopener">
                13F filings ↗
              </a>
            </div>
            <div className="hub-label no-mb">Reporting managers</div>
            <SeriesChart
              series={[{ id: "holders", label: "Reporting managers", kind: "focal", points: reg.quarters.map((q, i) => ({ period: q, value: reg.holderCounts[i] })) }]}
              format={(v) => String(Math.round(v))}
              height={130}
              label="Reporting managers by quarter"
            />
            <div className="hub-label no-mb inst-mt">Shares reported (M)</div>
            <SeriesChart
              series={[{ id: "shares", label: "Shares reported (M)", kind: "focal", points: reg.quarters.map((q, i) => ({ period: q, value: reg.sharesM[i] })) }]}
              format={(v) => `${Math.round(v)}M`}
              height={130}
              label="Shares reported by quarter"
            />
            <div className="hub-note">Net change this quarter: {reg.netHolders}</div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Manager mix</span>
              <span className="hub-hint">classification assigned by ClearyFi</span>
              <button
                type="button"
                className="hub-tab is-sm"
                onClick={() => setOpenCalc((c) => (c === "classification" ? null : "classification"))}
              >
                ƒ how this is computed
              </button>
            </div>
            <StackedAreaChart periods={reg.mix.periods} bands={reg.mix.bands} height={170} label="Manager mix over nine quarters" />
            <div className="hub-note">
              Share of the 13F-reported register by manager type, nine quarters. Colour is
              categorical identity only.
            </div>
            {reg.mixLegend.map((m) => (
              <div className="inst-mix-row" key={m.k}>
                <div className="inst-mix-head">
                  <span className="inst-mix-name">
                    <i style={{ background: m.color }} />
                    {m.k}
                  </span>
                  <span className="hub-cell-mono">{m.pct}</span>
                </div>
                {/* The tick is the prior quarter — the bar is a level, the tick makes it a move. */}
                <div className="inst-mix-track">
                  <div style={{ width: `${m.pctN}%` }} />
                  <span className="inst-mix-tick" style={{ left: `${m.priorN}%` }} />
                </div>
                <div className="hub-note inst-mix-note">tick: prior quarter {m.prior}</div>
              </div>
            ))}
            <div className="inst-top10">
              <div className="inst-mix-head">
                <span className="hub-label no-mb">Top ten managers</span>
                {/* The figure IS the control — a concentration number you cannot open is an
                    assertion. */}
                <button
                  type="button"
                  className="inst-fig-inline"
                  onClick={() => setOpenCalc((c) => (c === "top10fig" ? null : "top10fig"))}
                >
                  {reg.top10}
                </button>
              </div>
              <div className="inst-mix-head">
                <span className="hub-note">{reg.top10Note}</span>
                <button
                  type="button"
                  className="hub-tab is-sm"
                  onClick={() => setOpenCalc((c) => (c === "top10" ? null : "top10"))}
                >
                  ƒ how this is computed
                </button>
              </div>
              {openCalc === "classification" && <HowComputed calc={ext.classificationCalc} />}
              {openCalc === "top10" && <HowComputed calc={ext.top10Calc} />}
              {openCalc === "top10fig" && (
                <div className="hub-drawer">
                  <div className="hub-drawer-title">
                    <span className="hub-panel-title is-sm">Top ten managers</span>
                    <span className="hub-cell-mono">{ext.top10Latest}</span>
                    <span className="hub-cell-mono is-soft">{ext.top10Change}</span>
                  </div>
                  <SeriesChart
                    series={[{ id: "top10", label: "Top ten share", kind: "focal", points: ext.top10Series }]}
                    format={(v) => `${v.toFixed(0)}%`}
                    area
                    height={150}
                    label="Top ten manager share over nine quarters"
                  />
                  <div className="hub-drawer-notes">
                    <span>{ext.top10DrawerNote}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="inst-more">
          <button type="button" className="hub-tab" onClick={() => setHoldersOpen((o) => !o)}>
            {holdersOpen ? "− hide the manager list" : "+ show every reporting manager"}
          </button>
          <span className="hub-hint">
            largest reporting managers · nine-quarter panel each · shares, share of the 13F register and quarter-over-quarter change
          </span>
        </div>

        {holdersOpen && (
          <div className="p-card inst-mt">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Largest reporting managers</span>
              <span className="hub-hint">13F-HR, position as of 1Q26 · Δ is quarter over quarter in shares</span>
              <a className="inst-link" href={edgarLink(cik, "13F-HR")} target="_blank" rel="noopener">
                Read the 13F table ↗
              </a>
            </div>

            <div className="inst-mix-head">
              <span className="hub-label no-mb">Reported shares, nine quarters · one panel per manager</span>
              <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setZoom("mgrGrid")}>
                ⤡ Expand
              </button>
            </div>
            <div className="inst-mgr-grid">
              {reg.holders.map((h) => (
                <div className="inst-mgr-panel" key={h.name}>
                  <div className="inst-mgr-name">{h.name}</div>
                  <Sparkline points={h.spark.map((v, i) => ({ period: reg.mix.periods[i], value: v }))} height={26} />
                  <div className="hub-cell-mono is-soft">{h.shares}</div>
                </div>
              ))}
            </div>
            {/* Independently scaled panels: say so, or the heights read as comparable. */}
            <div className="hub-note">
              Each panel is rebuilt from that manager&apos;s own 13F-HR filings as they were
              filed. Panels are scaled independently, so read the trajectory and the printed
              figures, not the relative heights.
            </div>

            <div className="hub-table-head inst-hold-grid">
              <span>Manager · classification</span>
              <span className="ta-r">Shares</span>
              {/* NOT "% out": this is a share of 13F-REPORTED shares, a different and much
                  smaller denominator than shares outstanding. §01's tiles use outstanding. */}
              <span className="ta-r">% of 13F</span>
              <span className="ta-r">Δ QoQ</span>
            </div>
            {reg.holders.map((h) => (
              <div className="inst-hold-grid hub-row" key={h.name}>
                <span className="hub-cell">
                  <span className="row-title">{h.name}</span>
                  <div className="row-sub">
                    {h.kind} · {h.form} · filed {h.filed}
                  </div>
                </span>
                <span className="hub-cell-mono ta-r">{h.shares}</span>
                <span className="hub-cell-mono ta-r">{h.pct}</span>
                <span className="hub-cell-mono ta-r is-soft">{h.delta}</span>
              </div>
            ))}
            <div className="hub-note">
              Managers are named as they appear on the cover of the 13F-HR; affiliated entities
              file separately and are not consolidated here.
            </div>
          </div>
        )}

        {zoom && (
          <div className="hist-zoom" role="dialog" aria-label="Expanded chart">
            <div className="hist-zoom-panel">
              <div className="hist-zoom-head">
                <div className="hub-drawer-title">
                  <span className="hub-panel-title">
                    {zoom === "register"
                      ? "Register over time"
                      : zoom === "mgrGrid"
                        ? "Reported shares by manager"
                        : zoom === "flow"
                          ? "Position changes over time"
                          : zoom === "pareto"
                            ? "Ranked manager share"
                            : zoom === "tree"
                              ? "Manager share treemap"
                              : "Overlap with sector peers"}
                  </span>
                  <span className="hub-hint">
                    {zoom === "register"
                      ? "holder count and reported shares, five quarters"
                      : "nine quarters · one panel per manager · panels scaled independently"}
                  </span>
                </div>
                <button type="button" className="hub-tab" onClick={() => setZoom(null)}>
                  Close
                </button>
              </div>
              {zoom === "flow" ? (
                <DivergeChart rows={flows.flow} format={(v) => `${Math.round(v)}M`} height={420} label="Position changes, expanded" />
              ) : zoom === "pareto" ? (
                <ParetoChart rows={flows.pareto} format={(v) => `${Math.round(v)}M`} height={440} label="Ranked manager share, expanded" />
              ) : zoom === "tree" ? (
                <Treemap leaves={flows.treemap} format={(v) => `${Math.round(v)}M shares`} height={460} label="Manager share treemap, expanded" />
              ) : zoom === "upset" ? (
                // The overlap panel's own content, not the concentration curve — expanding a
                // panel must enlarge THAT panel.
                <div className="inst-zoom-overlap">
                  {overlapView === "combos" ? (
                    <UpsetChart
                      sets={flows.upsetSets}
                      combos={flows.upset}
                      format={(v) => `${Math.round(v)} managers`}
                      height={340}
                      label="Manager set intersections, expanded"
                    />
                  ) : (
                    <MatrixChart
                      rows={flows.matrix.rows}
                      cols={flows.matrix.cols}
                      cells={flows.matrix.cells}
                      format={(v) => `${v.toFixed(2)}% of shares outstanding`}
                      height={360}
                      label="Manager by peer-issuer adjacency, expanded"
                    />
                  )}
                </div>
              ) : zoom === "register" ? (
                <>
                  <div className="hub-label no-mb">Reporting managers</div>
                  <SeriesChart
                    series={[{ id: "holdersZ", label: "Reporting managers", kind: "focal", points: reg.quarters.map((q, i) => ({ period: q, value: reg.holderCounts[i] })) }]}
                    format={(v) => String(Math.round(v))}
                    height={210}
                    label="Reporting managers, expanded"
                  />
                  <div className="hub-label no-mb inst-mt">Shares reported (M)</div>
                  <SeriesChart
                    series={[{ id: "sharesZ", label: "Shares reported (M)", kind: "focal", points: reg.quarters.map((q, i) => ({ period: q, value: reg.sharesM[i] })) }]}
                    format={(v) => `${Math.round(v)}M`}
                    height={210}
                    label="Shares reported, expanded"
                  />
                </>
              ) : (
                <div className="inst-mgr-grid is-zoom">
                  {reg.holders.map((h) => (
                    <div className="inst-mgr-panel" key={h.name}>
                      <div className="inst-mgr-name">{h.name}</div>
                      <Sparkline points={h.spark.map((v, i) => ({ period: reg.mix.periods[i], value: v }))} height={44} />
                      <div className="hub-cell-mono is-soft">{h.shares}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="hub-sec">
        <InstHead id="i3" />

        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Position changes over time</span>
            <span className="hub-hint">shares added above the axis, reduced below · rule marks the net</span>
            <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setZoom("flow")}>
              ⤡ Expand
            </button>
            <a className="inst-link" href={edgarLink(cik, "13F-HR")} target="_blank" rel="noopener">
              13F filings ↗
            </a>
          </div>
          <DivergeChart rows={flows.flow} format={(v) => `${Math.round(v)}M`} height={200} label="Position changes by quarter" />

          <div className="hub-label inst-mt">This quarter by manager count · 1Q26 vs 4Q25</div>
          <div className="hub-table-head inst-qt-grid">
            <span>Quarter</span>
            <span className="ta-r">Added</span>
            <span className="ta-r">Reduced</span>
          </div>
          {flows.quarterTable.map((r) => (
            <div className="inst-qt-grid hub-row" key={r.q}>
              <span className="hub-cell-mono">{r.q}</span>
              <span className="hub-cell-mono ta-r">
                {r.added} <span className="is-soft">{r.addedSh}</span>
              </span>
              <span className="hub-cell-mono ta-r">
                {r.reduced} <span className="is-soft">{r.reducedSh}</span>
              </span>
            </div>
          ))}
          <div className="hub-note">
            Counts are managers; share figures are the aggregate change in reported shares.
            Direction is described, not scored.
          </div>
        </div>

        <div className="p-card inst-mt">
          <div className="hub-panel-head is-split">
            <span className="hub-panel-title">Who holds what</span>
            <div className="hub-tabs is-sm">
              {(["ranked", "treemap"] as const).map((v) => (
                <button key={v} type="button" className={`hub-tab is-sm${holdView === v ? " is-active" : ""}`} onClick={() => setHoldView(v)}>
                  {v === "ranked" ? "Ranked" : "Treemap"}
                </button>
              ))}
              <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setZoom(holdView === "ranked" ? "pareto" : "tree")}>
                ⤡ Expand
              </button>
              <a className="inst-link" href={edgarLink(cik, "13F-HR")} target="_blank" rel="noopener">
                13F table ↗
              </a>
            </div>
          </div>
          <div className="hub-hint">ranked manager share of the 13F-reported register · 1Q26</div>
          {holdView === "ranked" ? (
            <ParetoChart rows={flows.pareto} format={(v) => `${Math.round(v)}M`} height={250} label="Ranked manager share" />
          ) : (
            <Treemap leaves={flows.treemap} format={(v) => `${Math.round(v)}M shares`} height={280} label="Manager share treemap" />
          )}
        </div>

        <div className="p-card inst-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">How concentrated the register is</span>
            <span className="hub-hint">HHI · effective holders · Lorenz</span>
          </div>

          <div className="inst-figs is-sm">
            <button
              type="button"
              className={`inst-fig${openCalc === "eff" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "eff" ? null : "eff"))}
            >
              <span className="hub-label no-mb">Effective holders</span>
              <span className="inst-fig-value">{flows.effective}</span>
              <span className="hub-hint">effective holders is 10,000 ÷ HHI</span>
            </button>
            <button
              type="button"
              className={`inst-fig${openCalc === "hhi" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "hhi" ? null : "hhi"))}
            >
              <span className="hub-label no-mb">HHI</span>
              <span className="inst-fig-value">{flows.hhi}</span>
              <span className="hub-hint">the measures behind it</span>
            </button>
            <button
              type="button"
              className={`inst-fig${openCalc === "gini" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "gini" ? null : "gini"))}
            >
              <span className="hub-label no-mb">Gini</span>
              <span className="inst-fig-value">{flows.gini}</span>
              <span className="hub-hint">inequality across holders, from the curve below</span>
            </button>
            <div className="inst-fig is-static">
              <span className="hub-label no-mb">Half the register</span>
              <span className="inst-fig-value is-plain">{flows.halfCount}</span>
              <span className="hub-hint">managers hold 50%</span>
            </div>
          </div>
          {openCalc === "eff" && <HowComputed calc={flows.calcs.eff} />}
          {openCalc === "hhi" && <HowComputed calc={flows.calcs.hhi} />}
          {openCalc === "gini" && <HowComputed calc={flows.calcs.gini} />}

          <div className="inst-mt">
            <LorenzChart shares={flows.lorenz} height={240} label="Register concentration" />
          </div>

          <div className="inst-more">
            <button type="button" className="hub-tab" onClick={() => setFlowsOpen((o) => !o)}>
              {flowsOpen ? "− hide domicile and overlap" : "+ show domicile and peer overlap"}
            </button>
            <span className="hub-hint">where managers file from, and which peers they also hold</span>
          </div>
        </div>

        {flowsOpen && (
          <div className="inst-pair inst-mt">
            <div className="p-card">
              <div className="hub-panel-head">
                <span className="hub-panel-title">Manager domicile</span>
                <span className="hub-hint">13F-HR cover page address</span>
              </div>
              <StackedBar parts={flows.domicile.map((d) => ({ key: d.key, label: d.label, share: d.share }))} />
              <div className="hub-note">
                The cover-page address is where the filing entity sits, not where the capital
                came from — a US-domiciled subsidiary of a foreign parent files as US.
              </div>
            </div>

            <div className="p-card">
              <div className="hub-panel-head is-split">
                <span className="hub-panel-title">Overlap with sector peers</span>
                <div className="hub-tabs is-sm">
                  {(["combos", "peers"] as const).map((v) => (
                    <button key={v} type="button" className={`hub-tab is-sm${overlapView === v ? " is-active" : ""}`} onClick={() => setOverlapView(v)}>
                      {v === "combos" ? "Combinations" : "By manager"}
                    </button>
                  ))}
                  <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setZoom("upset")}>
                    ⤡ Expand
                  </button>
                </div>
              </div>
              <div className="hub-hint">managers reporting both issuers</div>
              {overlapView === "combos" ? (
                <>
                  <UpsetChart
                    sets={flows.upsetSets}
                    combos={flows.upset}
                    format={(v) => `${Math.round(v)} managers`}
                    label="Manager set intersections"
                  />
                  <div className="hub-note">
                    Each bar is a set of managers reporting the same combination of issuers; the
                    dots below name which. The last column is managers holding none of the three.
                  </div>
                </>
              ) : (
                <>
                  <div className="hub-label inst-mt">Largest holders, and how many peers they also hold</div>
                  <MatrixChart
                    rows={flows.matrix.rows}
                    cols={flows.matrix.cols}
                    cells={flows.matrix.cells}
                    format={(v) => `${v.toFixed(2)}% of shares outstanding`}
                    label="Manager by peer-issuer adjacency"
                  />
                  <div className="hub-note">
                    A hatched cell is a peer this manager reports no position in — not a zero
                    position. Fill is single-hue: one magnitude, no midpoint implied.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* These two are one row at width, not a stack: attribution and tenure are two readings
            of the same register, and the prototype sets them side by side to be compared. */}
        <div className="inst-pair inst-mt">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Where every share sits</span>
            <span className="hub-hint">shares outstanding, fully attributed</span>
          </div>
          <StackedBar parts={flows.residual.map((r) => ({ key: r.key, label: r.label, share: r.share }))} />
          <div className="inst-more">
            <button
              type="button"
              className="hub-tab is-sm"
              onClick={() => setOpenCalc((c) => (c === "residual" ? null : "residual"))}
            >
              ƒ how this is computed
            </button>
            <span className="hub-hint">Residual over time · trend</span>
          </div>
          {openCalc === "residual" && <HowComputed calc={flows.calcs.residual} />}
          <SeriesChart
            series={[{ id: "residual", label: "Not attributed", kind: "focal", points: flows.residualSeries }]}
            format={(v) => `${v.toFixed(0)}%`}
            area
            height={150}
              label="Unattributed share over nine quarters"
            />
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Stable-capital share</span>
            {/* The anchor is part of the claim: these are computed on the newest INGESTED quarter,
                which while a quarter is still being filed is a partial register. */}
            <span className="hub-hint">
              register weighted by holding tenure · measured over {flows.firstQuarter}
            </span>
          </div>
          <div className="inst-figs is-sm">
            <button
              type="button"
              className={`inst-fig${openCalc === "stable" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "stable" ? null : "stable"))}
            >
              <span className="hub-label no-mb">Stable-capital share</span>
              <span className="inst-fig-value">{flows.stable}</span>
              <span className="hub-hint">held 8+ consecutive quarters</span>
            </button>
            <div className="inst-fig is-static">
              <span className="hub-label no-mb">Tenure-weighted stable</span>
              <span className="inst-fig-value is-plain">{flows.tenureWeighted}</span>
              <span className="hub-hint">decaying weight by cohort</span>
            </div>
            <div className="inst-fig is-static">
              <span className="hub-label no-mb">First-quarter holders</span>
              <span className="inst-fig-value is-plain">{flows.firstQuarter}</span>
              <span className="hub-hint">reporting this issuer for the first time</span>
            </div>
          </div>
          {openCalc === "stable" && <HowComputed calc={flows.calcs.stable} />}
          <div className="hub-table-head inst-cohort-grid inst-mt">
            <span>Cohort</span>
            <span />
            <span className="ta-r">Share</span>
            <span className="ta-r">Weight</span>
          </div>
            {flows.cohorts.map((c) => (
              <div className="inst-cohort-grid hub-row" key={c.cohort}>
                <span className="hub-cell">{c.cohort}</span>
                {/* The unlabeled column in the prototype's four-track grid is a bar — section
                    05's tenure table uses the same arrangement with the bar visible. */}
                <span className="inst-tenure-track">
                  <span style={{ width: `${parseFloat(c.share)}%` }} />
                </span>
                <span className="hub-cell-mono ta-r">{c.share}</span>
                <span className="hub-cell-mono ta-r is-soft">{c.weight}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="hub-sec">
        <InstHead id="i4" />

        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Beneficial ownership filings</span>
            <span className="hub-hint">SC 13D / 13G · above the 5% threshold</span>
            <a className="inst-link" href={edgarLink(cik, "SC 13D")} target="_blank" rel="noopener">
              Read the filings ↗
            </a>
          </div>
          <div className="inst-mix-head">
            <span className="hub-label no-mb">Filing history · stake as reported in each filing</span>
            <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setStripZoom(true)}>
              ⤡ Expand
            </button>
          </div>
          <EventStrip lanes={stew.blockLanes} label="Beneficial ownership filing history" />
          <div className="hub-note">{stew.blockStripNote}</div>

          <div className="hub-label inst-mt">Current filings on file</div>
          {stew.blocks.map((b) => (
            <div className="inst-block-grid hub-row" key={b.name}>
              <span className="hub-cell">
                <span className="row-title">{b.name}</span>
                <div className="row-sub">{b.purpose}</div>
                <div className="row-sub">{b.amended}</div>
              </span>
              <span className="form-badge">{b.form}</span>
              <span className="hub-cell-mono ta-r">{b.pct}</span>
            </div>
          ))}
          {/* 13D vs 13G is a filing CHOICE, not a character judgment about the holder. */}
          {/* The fixture quoted Item 4 purpose language; the parser does not read it, so the
              rows say so and this note must not claim otherwise. */}
          <div className="hub-note">
            13D and 13G are categorical filing choices, not a judgment about the holder — a 13D
            is filed by a holder who may seek to influence control, a 13G by one asserting a
            passive stake. The stated purpose behind a filing is Item 4 narrative and is not
            parsed, so it is named rather than summarised.
          </div>
        </div>

        <div className="p-card inst-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Voting behavior</span>
            <span className="hub-hint">8-K Item 5.07 outcomes · manager-level votes from N-PX</span>
            <a className="inst-link" href={edgarLink(cik, "8-K")} target="_blank" rel="noopener">
              Read Item 5.07 ↗
            </a>
            <a className="inst-link" href={edgarLink(cik, "N-PX")} target="_blank" rel="noopener">
              N-PX ↗
            </a>
          </div>

          <div className="inst-figs is-sm">
            <button
              type="button"
              className={`inst-fig${openCalc === "sop" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "sop" ? null : "sop"))}
            >
              <span className="hub-label no-mb">Say-on-pay support</span>
              <span className="inst-fig-value">{stew.voting.sayOnPay}</span>
            </button>
            <button
              type="button"
              className={`inst-fig${openCalc === "withhold" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "withhold" ? null : "withhold"))}
            >
              <span className="hub-label no-mb">Director withhold</span>
              <span className="inst-fig-value">{stew.voting.withhold}</span>
            </button>
            <div className="inst-fig is-static">
              <span className="hub-label no-mb">Turnout</span>
              <span className="inst-fig-value is-plain">{stew.voting.turnout}</span>
            </div>
            <div className="inst-fig is-static">
              <span className="hub-label no-mb">Ballot items</span>
              <span className="inst-fig-value is-plain">{stew.voting.proposals}</span>
            </div>
          </div>

          {openCalc === "sop" && (
            <FigDrawer
              title="Say-on-pay support"
              series={stew.sopSeries}
              note="Advisory and non-binding. A high support figure records the vote, not the board's response to it."
            />
          )}
          {openCalc === "withhold" && (
            <FigDrawer
              title="Director withhold"
              series={stew.withholdSeries}
              note="Withheld votes are counted against the nominee only where the company's bylaws make the election majority-rule; under plurality voting a nominee can be seated with any level of withhold."
            />
          )}

          <div className="inst-more">
            <button type="button" className="hub-tab" onClick={() => setStewOpen((o) => !o)}>
              {stewOpen ? "− hide the vote-weighted breakdown" : "+ show the vote-weighted breakdown"}
            </button>
            <span className="hub-hint">13F shares matched to the manager&apos;s N-PX record</span>
          </div>

          {stewOpen && (
            <>
              {stew.voteWeighted.rows.map((v) => (
                <div className="inst-vw-row" key={v.k}>
                  <div className="inst-mix-head">
                    <span className="hub-cell">{v.k}</span>
                    <span className="hub-cell-mono">{v.pct}</span>
                  </div>
                  <div className="hub-comp-track">
                    <div style={{ width: `${v.pctN}%` }} />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className={`inst-fig is-wide${openCalc === "dissent" ? " is-open" : ""}`}
                onClick={() => setOpenCalc((c) => (c === "dissent" ? null : "dissent"))}
              >
                <span className="hub-label no-mb">Shares behind a dissenting vote</span>
                <span className="inst-fig-value">{stew.voteWeighted.dissentShares}</span>
              </button>
              {openCalc === "dissent" && (
                <FigDrawer
                  title="Shares behind a dissenting vote"
                  series={stew.dissentSeries}
                  format={(v) => `${Math.round(v)}M`}
                  note="Reported 13F shares held by managers whose own N-PX record shows a vote against management. It is the weight behind the dissent, not the margin of the vote itself."
                />
              )}
              <div className="hub-note">{stew.voteWeighted.note}</div>
            </>
          )}
        </div>

        <div className="p-card inst-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Activism trail</span>
            <span className="hub-hint">SC 13D amendments · 8-K Item 1.01 exhibits</span>
            <a className="inst-link" href={edgarLink(cik, "SC 13D")} target="_blank" rel="noopener">
              Read the 13D chain ↗
            </a>
          </div>
          {stew.activism.active ? (
            <>
              <div className="inst-act-head">
                <span className="hub-firm-name">{stew.activism.holder}</span>
                <span className="hub-cell-mono">{stew.activism.stake} reported stake</span>
                {/* Board seats and any standstill are 13D Item 4 narrative — rendering 0 seats
                    would read as "sought none", which is a different claim from "not parsed". */}
                <span className="hub-cell-mono is-soft">
                  {stew.activism.seats === null
                    ? "board seats and standstill terms are Item 4 narrative — not parsed"
                    : `${stew.activism.seats} board seat(s) · standstill ${stew.activism.standstill}`}
                </span>
              </div>
              <StepChart
                series={[{ id: "act", label: stew.activism.holder, points: stew.activism.steps }]}
                threshold={5}
                height={220}
                label="Reported stake by filing"
              />
              {/* The steps ARE the record: a 13D/A is required when stated purpose materially
                  changes, so the flat segments are obligation, not interpolation. */}
              <div className="hub-note">
                The step line is the stake as reported in each filing, held flat until the next
                amendment — an amendment is required when the holder&apos;s stated purpose
                materially changes, so the steps are the record rather than an inference.
              </div>

              <div className="hub-label inst-mt">Filing sequence</div>
              {stew.activism.trail.map((r, i) => (
                <div className="inst-trail-grid hub-row" key={`${r.form}${i}`}>
                  <span className="form-badge">{r.form}</span>
                  <span className="hub-cell-mono is-soft">{r.date}</span>
                  <span className="hub-cell">{r.what}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="hub-prose">
              No SC 13D on file for this issuer. Every reported 5% holder filed a 13G, the
              passive schedule — which is a statement about the filing obligation each holder
              chose, not evidence that no one is engaging with the board.
            </p>
          )}
        </div>

        {stripZoom && (
          <div className="hist-zoom" role="dialog" aria-label="Filing history expanded">
            <div className="hist-zoom-panel">
              <div className="hist-zoom-head">
                <div className="hub-drawer-title">
                  <span className="hub-panel-title">Filing history</span>
                  <span className="hub-hint">stake as reported in each filing</span>
                </div>
                <button type="button" className="hub-tab" onClick={() => setStripZoom(false)}>
                  Close
                </button>
              </div>
              <EventStrip lanes={stew.blockLanes} height={260} label="Filing history, expanded" />
            </div>
          </div>
        )}
      </section>

      <section className="hub-sec">
        <InstHead id="i5" />

        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Holder persistence</span>
            <span className="hub-hint">CIK matched across consecutive 13F-HR filings</span>
            <button
              type="button"
              className="hub-tab is-sm"
              onClick={() => setOpenCalc((c) => (c === "turnoverCalc" ? null : "turnoverCalc"))}
            >
              ƒ turnover
            </button>
            <button
              type="button"
              className="hub-tab is-sm"
              onClick={() => setOpenCalc((c) => (c === "persistCalc" ? null : "persistCalc"))}
            >
              ƒ holding period
            </button>
          </div>

          <div className="inst-figs is-sm">
            <button
              type="button"
              className={`inst-fig${openCalc === "turnover" ? " is-open" : ""}`}
              onClick={() => setOpenCalc((c) => (c === "turnover" ? null : "turnover"))}
            >
              <span className="hub-label no-mb">Register turnover</span>
              <span className="inst-fig-value">{beh.turnover}</span>
            </button>
            <div className="inst-fig is-static">
              <span className="hub-label no-mb">Median holding period</span>
              <span className="inst-fig-value is-plain">{beh.medianHold}</span>
            </div>
          </div>

          {openCalc === "turnover" && (
            <FigDrawer
              title="Register turnover"
              series={beh.turnoverSeries}
              note="A manager that stops filing looks identical to one that sold. The 13F says nothing about which happened."
            />
          )}
          {openCalc === "turnoverCalc" && <HowComputed calc={beh.calcs.turnover} />}
          {openCalc === "persistCalc" && <HowComputed calc={beh.calcs.persist} />}

          <div className="inst-mix-head inst-mt">
            <span className="hub-label no-mb">
              Retention by entry cohort · % of cohort still reporting
            </span>
            <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setCohortZoom(true)}>
              ⤡ Expand
            </button>
          </div>
          <CohortHeatmap
            rows={beh.cohortHeat.rows}
            cols={beh.cohortHeat.cols}
            cells={beh.cohortHeat.cells}
            format={(v) => `${Math.round(v)}% still reporting`}
            label="Retention by entry cohort"
          />
          <div className="hub-note">{beh.cohortNote}</div>

          <div className="hub-label inst-mt">Register today, by tenure</div>
          {beh.cohorts.map((c) => (
            <div className="inst-tenure-grid" key={c.k}>
              <span className="hub-cell">{c.k}</span>
              {/* The unlabeled middle column in the prototype's grid is a bar, not a spacer. */}
              <span className="inst-tenure-track">
                <span style={{ width: `${c.pctN}%` }} />
              </span>
              <span className="hub-cell-mono ta-r">{c.pct}</span>
            </div>
          ))}
          <div className="hub-note">{beh.note}</div>
        </div>

        <div className="inst-more">
          <button type="button" className="hub-tab" onClick={() => setBehOpen((o) => !o)}>
            {behOpen ? "− hide fund-level positions" : "+ show fund-level positions"}
          </button>
          <span className="hub-hint">N-PORT, filed monthly by the fund rather than by the manager</span>
        </div>

        {behOpen && (
          <div className="p-card inst-mt">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Fund-level positions</span>
              <span className="hub-hint">N-PORT · monthly, named funds</span>
              <a className="inst-link" href={edgarLink(cik, "N-PORT")} target="_blank" rel="noopener">
                Read N-PORT ↗
              </a>
            </div>
            {beh.funds.map((f2) => (
              <div className="inst-fund-grid hub-row" key={f2.name}>
                <span className="hub-cell">
                  <span className="row-title">{f2.name}</span>
                  <div className="row-sub">
                    {f2.family} · as of {f2.asOf}
                  </div>
                  <span className="inst-fund-bar">
                    <span className="inst-tenure-track">
                      <span style={{ width: `${Math.min(100, f2.pctFundN * 10)}%` }} />
                    </span>
                    <span className="hub-cell-mono is-soft">{f2.pctFund} of fund</span>
                  </span>
                </span>
                <span className="hub-cell-mono ta-r">{f2.shares}</span>
                <span className="hub-cell-mono ta-r is-soft">{f2.change}</span>
              </div>
            ))}
            {/* N-PORT is a different filer from the 13F manager — the section exists to say so. */}
            <div className="hub-note">{beh.fundNote}</div>
          </div>
        )}

        {cohortZoom && (
          <div className="hist-zoom" role="dialog" aria-label="Retention by entry cohort expanded">
            <div className="hist-zoom-panel">
              <div className="hist-zoom-head">
                <div className="hub-drawer-title">
                  <span className="hub-panel-title">Retention by entry cohort</span>
                  <span className="hub-hint">% of cohort still reporting</span>
                </div>
                <button type="button" className="hub-tab" onClick={() => setCohortZoom(false)}>
                  Close
                </button>
              </div>
              <CohortHeatmap
                rows={beh.cohortHeat.rows}
                cols={beh.cohortHeat.cols}
                cells={beh.cohortHeat.cells}
                format={(v) => `${Math.round(v)}% still reporting`}
                height={300}
                label="Retention by entry cohort, expanded"
              />
            </div>
          </div>
        )}
      </section>

      <section className="hub-sec">
        <InstHead id="i6" />

        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Supply-side events</span>
            <span className="hub-hint">S-1 / S-3 · SC TO · Form 144 · Form 25 / 15</span>
          </div>

          {lim.selling.active && (
            <div className="inst-act-head">
              <span className="form-badge">{lim.selling.form}</span>
              <span className="hub-cell-mono">
                {lim.selling.holders} · {lim.selling.shares} registered for resale
              </span>
            </div>
          )}

          {lim.checks.map((ck) => (
            <div className="inst-check-grid hub-row" key={ck.k}>
              <span className="inst-check-name">
                <i className={ck.on ? "is-on" : undefined} />
                {ck.k}
              </span>
              <span className="hub-cell-mono ta-r">{ck.state}</span>
              <span className="hub-cell-mono ta-r is-soft">{ck.forms}</span>
            </div>
          ))}
          <div className="hub-note">{lim.asOf}</div>

          <div className="inst-mix-head inst-mt">
            <span className="hub-label no-mb">Windows and expiries ahead</span>
            <button type="button" className="hub-tab is-sm" title="Open larger" onClick={() => setGanttZoom(true)}>
              ⤡ Expand
            </button>
          </div>
          <GanttChart rows={lim.gantt} today="2026-08-02" label="Windows and expiries ahead" />
          <div className="hub-note">{lim.ganttNote}</div>
          <div className="hub-note">{lim.supplyNote}</div>
        </div>

        <div className="inst-more">
          <button type="button" className="hub-tab" onClick={() => setLimitsOpen((o) => !o)}>
            {limitsOpen ? "− hide insider filings and register mechanics" : "+ show insider filings and register mechanics"}
          </button>
          <span className="hub-hint">what the register omits, and how completely it arrives</span>
        </div>

        {limitsOpen && (
          <div className="inst-pair inst-mt">
            <div className="p-card">
              <div className="hub-panel-head">
                <span className="hub-panel-title">Insider filings</span>
                <span className="hub-hint">Forms 3/4/5 · Form 144 · Item 405</span>
              </div>
              <div className="hub-facts">
                <span>{lim.insiderFilings.plans}</span>
                <span>{lim.insiderFilings.delinquent}</span>
              </div>
              {/* Cross-view navigation, not a drawer: the ledger lives on its own view. */}
              <button
                type="button"
                className="linkish inst-mt"
                onClick={() => navigate(sel.href(`/company/${sel.focal}/insider`))}
              >
                Insider activity view — ledger, transaction codes, Form 144 notices →
              </button>
              <div className="hub-note">
                Section 16 filings are reported in full on their own view. Insider ownership above
                comes from the DEF 14A table, which is dated as of the proxy record date.
              </div>
            </div>

            <div className="p-card">
              <div className="hub-panel-head">
                <span className="hub-panel-title">Register mechanics</span>
                <span className="hub-hint">completeness of the register itself</span>
              </div>
              <div className="hub-facts">
                {/* Confidential treatment is the one that makes the register knowably
                    incomplete in a way no figure on this page reveals. */}
                <span>{lim.mechanics.confidential}</span>
                <span>{lim.mechanics.amendments}</span>
                <span>{lim.mechanics.indexEvent}</span>
                <span>{lim.mechanics.lag}</span>
              </div>

              <div className="hub-label inst-mt">Acceptance lag across this quarter&apos;s filings</div>
              <Histogram
                values={lim.lagValues}
                median={lim.lagMedian}
                format={(v) => `${Math.round(v)}d`}
                height={170}
                label="Acceptance lag distribution"
              />
              <div className="hub-note">{lim.lagNote}</div>

              <div className="hub-label inst-mt">Amendments per 100 filings</div>
              <DivergeChart
                rows={lim.amendRate}
                format={(v) => v.toFixed(1)}
                height={150}
                label="Amendment rate by quarter"
              />
              <div className="hub-note">{lim.amendNote}</div>
              <div className="hub-note">{lim.mechanics.note}</div>
            </div>
          </div>
        )}

        {ganttZoom && (
          <div className="hist-zoom" role="dialog" aria-label="Windows and expiries expanded">
            <div className="hist-zoom-panel">
              <div className="hist-zoom-head">
                <div className="hub-drawer-title">
                  <span className="hub-panel-title">Windows and expiries ahead</span>
                  <span className="hub-hint">dates as stated in the filings</span>
                </div>
                <button type="button" className="hub-tab" onClick={() => setGanttZoom(false)}>
                  Close
                </button>
              </div>
              <GanttChart rows={lim.gantt} today="2026-08-02" label="Windows and expiries, expanded" />
            </div>
          </div>
        )}
      </section>

      <section className="hub-sec">
        <InstHead id="i7" />
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Forms and rules used on this page</span>
            <span className="hub-hint">what each source is, and what it cannot tell you</span>
          </div>
          <div className="inst-glossary">
            {INST_GLOSSARY.map(([term, def]) => (
              <div className="inst-gloss-item" key={term}>
                <span className="inst-gloss-term">{term}</span>
                <span className="inst-gloss-def">{def}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
