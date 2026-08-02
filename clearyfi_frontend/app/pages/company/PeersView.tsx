/**
 * Company Hub → Peer-relative, ported from the prototype's "Altitude 2: Company".
 *
 * Two comparisons, in order. First the reported financials — six metrics, each a peer cloud with
 * this filer marked. Then "beyond the financials": how it files, which accounting elections it
 * makes, how its board and register look, what it owes. The second half is the argument, because
 * the first half is available anywhere and the second is what the filings actually contain.
 *
 * Nothing here is coloured by favorability. A percentile is a POSITION; where a metric reads
 * better low the row says "lower is better" in words and the percentile is adjusted, and where a
 * metric has no agreed direction neither happens.
 *
 * The distribution strip is a CONTROL, not a picture: clicking a peer dot changes the focal
 * filer and the whole page recomputes.
 */
import { useState } from "react";
import { GEO_COLORS, GEO_LABELS, GEO_MIX, SECTOR_NAMES, SUB_COUNTS, THEMES } from "../../data/prototype";
import {
  CO_THEME_PCT, PX_GROUPS, RECENT_FILINGS, companyFlags, distRows, peerExtras,
  type PeerXRow, type PresenceTable,
} from "../../data/peers";
import { hubContextPill, hubSegmentChips } from "../../data/hub";
import { PeerStrip } from "../../charts/strips";
import { SeriesChart, Sparkline } from "../../charts/series";
import { useSelection } from "../../state";
import { navigate } from "../../router";

const Q_LABELS = ["−7", "−6", "−5", "−4", "−3", "−2", "−1", "now"];
const LADDER_COLORS = ["var(--accent)", "var(--gaap)", "#A88C5F", "var(--border-strong)"];

/**
 * The presence grid: which filers disclose which item.
 *
 * A filled cell means the item appears, nothing more — no ramp, because there is no magnitude.
 * The column floor is derived from the widest header token so labels never wrap, and the grid
 * scrolls sideways rather than compressing to illegibility.
 */
function Presence({ table }: { table: PresenceTable }) {
  const longest = Math.max(...table.cols.map((c) => c.length));
  const minCol = Math.max(30, Math.ceil(longest * 5.4) + 8);
  const grid = `72px repeat(${table.cols.length}, minmax(${minCol}px, 1fr))`;
  const minWidth = 72 + table.cols.length * (minCol + 4);
  return (
    <div>
      <div className="px-legend">
        <span>
          <i className="px-key is-on" />
          disclosed
        </span>
        <span>
          <i className="px-key" />
          not disclosed
        </span>
        <span>focal filer in the first row</span>
      </div>
      <div className="px-scrollcue">
        {table.cols.length} columns · scroll sideways for the rest →
      </div>
      <div className="px-scroll">
        <div style={{ minWidth }}>
          <div className="px-matrix-head" style={{ gridTemplateColumns: grid }}>
            <span />
            {table.cols.map((c) => (
              <span key={c} title={c}>
                {c}
              </span>
            ))}
          </div>
          {table.rows.map((r) => (
            <div
              className={`px-matrix-row${r.focal ? " is-focal" : ""}`}
              key={r.label}
              style={{ gridTemplateColumns: grid }}
            >
              <span className="px-matrix-label">{r.label}</span>
              {r.cells.map((v, ci) => (
                <span
                  key={table.cols[ci]}
                  className={`px-cell${v ? " is-on" : ""}`}
                  title={`${table.cols[ci]} · ${v ? "disclosed" : "not disclosed"}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="hub-note">{table.note}</div>
    </div>
  );
}

/** One "beyond the financials" row: value, sparkline, peer cloud, and the source it came from. */
function PxRow({
  r, focal, open, onToggle, onPick,
}: {
  r: PeerXRow;
  focal: string;
  open: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="px-row">
      <div className="px-row-head">
        <span className="px-row-id">
          <span className="px-row-name">{r.name}</span>
          <span className="px-row-src">{r.src}</span>
        </span>
        <span className="px-row-right">
          <button type="button" className="px-spark" onClick={onToggle} aria-expanded={open}>
            <Sparkline points={r.spk.map((v, i) => ({ period: String(i), value: v }))} height={18} />
            <span className="px-trend-label">{r.trendLabel}</span>
          </button>
          <span className="px-value">{r.valueLabel}</span>
        </span>
      </div>
      <PeerStrip
        variant="cloud"
        peers={r.vals.filter((v) => v.ticker !== focal).map((v) => ({ id: v.ticker, label: v.ticker, value: v.val }))}
        marks={[{ id: "foc", label: focal, value: r.focalVal, kind: "focal" }]}
        quantiles={{ lo: r.min, hi: r.max, q1: r.q1, q3: r.q3, med: r.med }}
        format={r.fmt}
        axisLabels={false}
        onPick={onPick}
        label={`${r.name} across the peer set`}
      />
      <div className="hub-note">{r.note}</div>
      {open && (
        <div className="px-trend">
          <div className="hub-label">Trailing eight quarters</div>
          <SeriesChart
            series={[
              { id: r.id, label: r.name, kind: "focal", points: r.spk.map((v, i) => ({ period: Q_LABELS[i], value: v })) },
            ]}
            format={r.fmt}
            height={150}
            label={`${r.name} over eight quarters`}
          />
          <div className="px-trend-caption">{r.trendCaption}</div>
        </div>
      )}
    </div>
  );
}

/** The three accounting-election mixes share one row shape. */
function MixRows({ rows }: { rows: { k: string; n: string; w: string; focal: boolean }[] }) {
  return (
    <>
      {rows.map((m) => (
        <div className="px-mix-row" key={m.k}>
          <span className="px-mix-label">
            {m.focal && <span className="px-thisfiler">this filer</span>}
            <span>{m.k}</span>
          </span>
          <span className="px-mix-track">
            <span style={{ width: m.w }} />
          </span>
          <span className="px-mix-n">{m.n}</span>
        </div>
      ))}
    </>
  );
}

export function PeersView() {
  const sel = useSelection();
  const T = sel.focal;
  // One open sparkline at a time, keyed so a financial row and a beyond-the-financials row
  // cannot both claim the same id.
  const [openSpark, setOpenSpark] = useState<string | null>(null);

  const rows = distRows(T);
  const X = peerExtras(T);
  const subActive = sel.subIdx >= 0;
  const group = PX_GROUPS.find((g) => g.key === sel.pxGroup) ?? PX_GROUPS[0];
  const groupRows: PeerXRow[] = X[group.key];
  const geo = GEO_MIX[sel.sectorIdx] ?? GEO_MIX[0];
  const segs = hubSegmentChips(T);
  /*
   * Picking a peer NAVIGATES rather than setting state. The path names the registrant and the
   * path wins (see `SelectionProvider`), so writing `?focal=` alone would change the query,
   * leave the path saying otherwise, and render the filer you started on.
   */
  const pick = (id: string) => navigate(sel.href(`/company/${id}/peers`, { focal: id }));

  return (
    <div className="px">
      <div className="qual-masthead">
        <div className="qual-masthead-left">
          <span className="qual-crumb">{SECTOR_NAMES[sel.sectorIdx]}</span>
          <span className="qual-sep">›</span>
          <span className="ia-name">{T}</span>
          <span className="ia-ticker">{T}</span>
        </div>
        <div className="qual-masthead-right">
          <span className="hub-crumb-pill">
            {hubContextPill(subActive, SUB_COUNTS[sel.subIdx] ?? 0)}
          </span>
          <span className="qual-sections">10-Q · Q1 FY26</span>
        </div>
      </div>

      <div className="px-split">
        {/* ---------------------------------------------------------------- sticky rail */}
        <div className="px-rail">
          <div className="hub-label">Percentile vs peers</div>
          {THEMES.map((t) => (
            <div className="px-pct" key={t.id}>
              <div className="px-pct-head">
                <span className="px-pct-name">{t.name}</span>
                <span className="px-pct-label">P{CO_THEME_PCT[t.id]}</span>
              </div>
              <div className="px-pct-track">
                <div style={{ width: `${CO_THEME_PCT[t.id]}%` }} />
              </div>
            </div>
          ))}
          <div className="px-rank">
            <div className="hub-label no-mb">Composite rank</div>
            <button
              type="button"
              className="px-rank-v"
              onClick={() => sel.set({ decomp: sel.decomp === "prof" ? null : "prof", expanded: "prof" })}
              title="Open the decomposition"
            >
              {subActive ? `4 / ${SUB_COUNTS[sel.subIdx]}` : "5 / 62"}
            </button>
            <div className="px-rank-move">↑ up 3 spots QoQ</div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- content */}
        <div className="px-body">
          <div className="px-head">
            <span className="px-head-title">Peer distribution</span>
            <span className="hub-hint">each dot a filer · band = IQR · line = median · ◆ = {T}</span>
          </div>

          <div className="p-card px-dist">
            {rows.map((r) => {
              const open = openSpark === r.key;
              const f = (v: number) => `${v.toFixed(1)}${r.fmt === "%" ? "%" : r.fmt === "x" ? "x" : ""}`;
              return (
                <div className="px-dist-row" key={r.key}>
                  <div className="px-dist-head">
                    <span className="px-dist-name">
                      <span>{r.name}</span>
                      {r.dirTag && <span className="px-dirtag">lower is better</span>}
                    </span>
                    <span className="px-row-right">
                      <button
                        type="button"
                        className="px-spark"
                        onClick={() => setOpenSpark(open ? null : r.key)}
                        aria-expanded={open}
                      >
                        <Sparkline points={r.spark.map((v, i) => ({ period: String(i), value: v }))} height={18} />
                        <span className="px-trend-label">{r.trendLabel}</span>
                      </button>
                      <span className="px-value">{r.valueLabel}</span>
                    </span>
                  </div>
                  <PeerStrip
                    variant="cloud"
                    peers={r.peers.map((p) => ({ id: p.ticker, label: p.ticker, value: p.val }))}
                    marks={[{ id: "foc", label: T, value: r.focalVal, kind: "focal" }]}
                    quantiles={{ lo: r.dist.min, hi: r.dist.max, q1: r.dist.q1, q3: r.dist.q3, med: r.dist.med }}
                    format={f}
                    axisLabels={false}
                    onPick={pick}
                    label={`${r.name} across the peer set`}
                  />
                  {open && (
                    <div className="px-trend">
                      <div className="hub-label">Trailing 8-quarter trend</div>
                      <SeriesChart
                        series={[
                          { id: r.key, label: r.name, kind: "focal", points: r.spark.map((v, i) => ({ period: Q_LABELS[i], value: v })) },
                        ]}
                        format={f}
                        height={150}
                        label={`${r.name} over eight quarters`}
                      />
                      <div className="px-trend-caption">{r.trendCaption}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hub-note">
            Click any peer dot to make it the focal filer. Click a sparkline to expand this
            filer&apos;s trailing trend. Percentiles are favorability-adjusted (§5) and exclude
            N/A · N/M filers (§9).
          </div>

          {/* segment & geographic mix */}
          <div className="p-card hub-mt-lg">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Segment &amp; geographic mix</span>
              <span className="hub-hint">ASC 280 · {T} 10-K</span>
            </div>
            <div className="px-mix">
              <div>
                <div className="hub-label">By segment</div>
                <div className="px-stackbar">
                  {segs.map((s) => (
                    <div key={s.label} style={{ width: s.pct, background: s.color }} />
                  ))}
                </div>
                <div className="px-legend-col">
                  {segs.map((s) => (
                    <span key={s.label}>
                      <i style={{ background: s.color }} />
                      {s.label} <b>{s.pct}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="hub-label">By region</div>
                <div className="px-stackbar">
                  {geo.map((v, i) => (
                    <div key={GEO_LABELS[i]} style={{ width: `${v}%`, background: GEO_COLORS[i] }} />
                  ))}
                </div>
                <div className="px-legend-col">
                  {geo.map((v, i) => (
                    <span key={GEO_LABELS[i]}>
                      <i style={{ background: GEO_COLORS[i] }} />
                      {GEO_LABELS[i]} <b>{v}%</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* filing history & flags */}
          <div className="p-card hub-mt-lg">
            <div className="hub-panel-head is-split">
              <span className="hub-panel-title">Filing history &amp; flags</span>
              <div className="px-flags">
                {companyFlags(T).map((f) => (
                  <span
                    key={f.label}
                    className="qual-chip"
                    style={{ color: f.color, background: f.bg, borderColor: f.border }}
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
            {RECENT_FILINGS.map((f) => (
              <div className="px-filing-row" key={`${f.form}${f.date}${f.desc}`}>
                <span className="px-filing-form">{f.form}</span>
                <span className="px-filing-desc">{f.desc}</span>
                <span className="hub-cell-mono ta-r is-soft">{f.date}</span>
              </div>
            ))}
          </div>

          {/* ---------------------------------------------------------------- beyond */}
          <div className="px-beyond">
            <span className="px-beyond-title">Beyond the financials</span>
            <span className="hub-hint">
              how this filer compares on disclosure, accounting choice, governance, ownership and
              obligations
            </span>
          </div>
          <div className="hub-note">{X.peerNote}</div>

          <div className="p-card hub-mt-lg" id={group.id}>
            <div className="px-group-head">
              <span className="px-group-n">{group.n}</span>
              <span className="hub-panel-title">{group.label}</span>
              <span className="hub-hint">{group.src}</span>
            </div>

            {groupRows.map((r) => (
              <PxRow
                key={r.id}
                r={r}
                focal={T}
                open={openSpark === `px:${r.id}`}
                onToggle={() => setOpenSpark(openSpark === `px:${r.id}` ? null : `px:${r.id}`)}
                onPick={pick}
              />
            ))}

            {group.key === "accounting" && (
              <>
                <div className="px-sub">Non-GAAP adjustment breadth · which items each filer excludes</div>
                <Presence table={X.nonGaap} />
                <div className="px-sub">Effective-tax-rate drivers named</div>
                <Presence table={X.taxDrivers} />
                <div className="px-sub">Inventory costing · how many peers use each method</div>
                <MixRows rows={X.inventory.rows} />
                <div className="px-sub">Revenue disaggregation axis chosen</div>
                <MixRows rows={X.revenue.rows} />
                <div className="px-sub">Internal-use software policy</div>
                <MixRows rows={X.software.rows} />
                <div className="hub-note">
                  Methods and axes are elections disclosed in the significant-accounting-policies
                  footnote. A minority choice is not a worse choice — it makes the filer less
                  directly comparable.
                </div>
              </>
            )}

            {group.key === "governance" && (
              <>
                <div className="px-sub">Critical audit matter topics across the peer set</div>
                <Presence table={X.camTopics} />
              </>
            )}

            {group.key === "ownership" && (
              <>
                <div className="px-sub">Shared-holder concentration across the peer set</div>
                <div className="px-shared-head">
                  <span className="px-shared-pct">{X.shared.pct}</span>
                  <span className="hub-hint">
                    of the peer set’s combined 13F-reported holdings sits with these ten managers
                  </span>
                </div>
                {X.shared.managers.map((m) => (
                  <div className="px-shared-row" key={m.name}>
                    <span className="px-shared-name">{m.name}</span>
                    <span className="px-mix-track">
                      <span style={{ width: m.w }} />
                    </span>
                    <span className="hub-cell-mono ta-r">{m.pct}</span>
                  </div>
                ))}
                <div className="hub-note">{X.shared.note}</div>
              </>
            )}

            {group.key === "obligations" && (
              <>
                <div className="px-sub">Maturity-ladder shape · share of total principal by bucket</div>
                <div className="px-legend">
                  {X.ladderLabels.map((l, i) => (
                    <span key={l}>
                      <i className="px-key is-solid" style={{ background: LADDER_COLORS[i] }} />
                      {l}
                    </span>
                  ))}
                </div>
                <div className="px-ladders">
                  {X.ladder.map((row) => (
                    <div className="px-ladder-row" key={row.ticker}>
                      <span className={`px-ladder-tk${row.focal ? " is-focal" : ""}`}>{row.ticker}</span>
                      <span className={`px-ladder-bar${row.focal ? " is-focal" : ""}`}>
                        {row.segs.map((s, j) => (
                          <span
                            key={row.labels[j]}
                            title={`${row.labels[j]} · ${s}%`}
                            style={{ width: `${s}%`, background: LADDER_COLORS[j] }}
                          />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="hub-note">
                  Each bar is one filer’s scheduled principal by maturity bucket, from the debt
                  footnote. The focal filer is drawn heavier. Shape is the comparison; the amounts
                  differ by orders of magnitude.
                </div>

                <div className="px-sub">EX-21 jurisdiction mix · this filer against the peer median</div>
                {X.jurisdictions.map((j) => (
                  <div className="px-jur-row" key={j.k}>
                    <span className="px-jur-name">{j.k}</span>
                    <span className="px-jur-track">
                      <span className="px-jur-fill" style={{ width: j.w }} />
                      <span className="px-jur-med" style={{ left: j.pw }} />
                    </span>
                    <span className="hub-cell-mono ta-r">{j.pct}</span>
                    <span className="hub-cell-mono ta-r is-soft">med {j.medPct}</span>
                  </div>
                ))}
                <div className="hub-note">
                  Share of listed subsidiaries by jurisdiction of organisation; the tick is the
                  peer median for that jurisdiction. EX-21 lists only subsidiaries the filer
                  considers significant.
                </div>

                <div className="px-sub">Contingency language used</div>
                <Presence table={X.contingency} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
