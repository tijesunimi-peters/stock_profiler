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
import { SECTOR_NAMES } from "../../data/sector-catalog";
import { PX_GROUPS } from "../../data/hub-catalog";
import type { BeyondRow } from "../../data/api";
import { api, fmtMetric } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { StateBlock } from "@ds";
import { PeerStrip } from "../../charts/strips";
import { SeriesChart, Sparkline } from "../../charts/series";
import { useSelection } from "../../state";
import { navigate } from "../../router";





/* Same fiscal key as the hub — see the note in HubOverview.tsx. */
const PX_YEAR = 2026;
const PX_PERIOD = "Q1";

export function PeersView() {
  const sel = useSelection();
  const T = sel.focal;
  // One open sparkline at a time, keyed so a financial row and a beyond-the-financials row
  // cannot both claim the same id.
  const [openSpark, setOpenSpark] = useState<string | null>(null);


  /*
   * Two reads, and the SECOND is shared with the Company hub. `companyIdentity` is what supplies
   * the segment chips and the peer-set pill on both surfaces — so the two views cannot show a
   * different peer rank for the same filer, which is the class of contradiction the seam exists to
   * make impossible.
   */
  const peerRead = useApi(() => api.companyPeerRelative(T, PX_YEAR, PX_PERIOD), [T]);
  const identity = useApi(
    () => api.companyIdentity(T, sel.subIdx),
    [T, sel.subIdx],
  );

  if (peerRead.error || identity.error) {
    return <StateBlock variant="error" copy={(peerRead.error ?? identity.error)!.message} />;
  }
  if (!peerRead.data || !identity.data) {
    return <StateBlock variant="loading" copy="Reading this filer's peer set." />;
  }

  const beyond = peerRead.data.beyond;
  const tp = peerRead.data.themePercentiles;
  const dist = peerRead.data.distribution;
  const group = PX_GROUPS.find((g) => g.key === sel.pxGroup) ?? PX_GROUPS[0];
  const mix = peerRead.data.segmentMix;
  const act = peerRead.data.filingActivity;
  const fflags = peerRead.data.filingFlags;
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
            {identity.data.contextPill}
          </span>
          <span className="qual-sections">10-Q · Q1 FY26</span>
        </div>
      </div>

      <div className="px-split">
        {/* ---------------------------------------------------------------- sticky rail */}
        <div className="px-rail">
          <div className="hub-label">
            Percentile vs peers{tp.peers ? ` · ${tp.peers}` : ""}
          </div>
          {/* Rendered from the API's OWN theme list, including the two it cannot score. Dropping
              those would leave a rail of five that looks complete; showing them unscored is the
              difference between "we did not ask" and "we asked and the signal is not filed". */}
          {tp.ok ? (
            tp.themes.map((t) => (
              <div className="px-pct" key={t.key}>
                <div className="px-pct-head">
                  <span className="px-pct-name">{t.label}</span>
                  <span className={`px-pct-label${t.scored ? "" : " is-soft"}`} title={t.reason ?? ""}>
                    {t.label_pct}
                  </span>
                </div>
                {/* No track where there is no percentile: a zero-width bar beside "not scored"
                    reads as a real bottom-of-the-group placing. */}
                {t.scored && t.pct !== null ? (
                  <div className="px-pct-track">
                    <div style={{ width: `${t.pct}%` }} />
                  </div>
                ) : null}
                {t.coverage ? <div className="hub-note">{t.coverage}</div> : null}
              </div>
            ))
          ) : (
            <StateBlock variant="empty" copy={tp.note ?? ""} />
          )}
          {/* Composite rank is NOT drawn. It was the literal string "5 / 62" with "↑ up 3 spots
              QoQ" beneath it — a rank across peers we do not compute, and a quarter-on-quarter
              move we do not store. Ranking the composite needs every peer's composite, which is
              a batch that does not exist; until it does this stays absent rather than invented. */}
        </div>

        {/* ---------------------------------------------------------------- content */}
        <div className="px-body">
          <div className="px-head">
            <span className="px-head-title">Peer distribution</span>
            <span className="hub-hint">each dot a filer · band = IQR · line = median · ◆ = {T}</span>
          </div>

          <div className="p-card px-dist">
            {dist.rows.length ? (
              dist.rows.map((r) => {
                const f = (v: number) => fmtMetric(v, r.unit);
                const open = openSpark === r.key;
                return (
                  <div className="px-dist-row" key={r.key}>
                    <div className="px-dist-head">
                      <span className="px-dist-name">
                        <span>{r.name}</span>
                        {/* Without this tag the cloud is read backwards: the favourable end of a
                            lower-is-better metric is the LEFT one. */}
                        {r.lowerIsBetter && <span className="px-dirtag">lower is better</span>}
                      </span>
                      <span className="px-row-right">
                        {r.spark ? (
                          <button
                            type="button"
                            className="px-spark"
                            onClick={() => setOpenSpark(open ? null : r.key)}
                            aria-expanded={open}
                            title="Expand this filer's trailing trend"
                          >
                            <Sparkline points={r.spark.points} height={18} />
                            <span className="px-trend-label">{r.spark.label}</span>
                          </button>
                        ) : null}
                        <span className="px-value">{r.valueLabel}</span>
                      </span>
                    </div>
                    <PeerStrip
                      variant="cloud"
                      peers={r.peers}
                      marks={[{ id: "foc", label: T, value: r.focalVal, kind: "focal" }]}
                      quantiles={r.quantiles}
                      format={f}
                      axisLabels={false}
                      label={`${r.name} across the peer set`}
                    />
                    <div className="hub-note">{r.peerCount} peers with a comparable value</div>
                    {open && r.spark ? (
                      <div className="px-trend">
                        <div className="hub-label">Trailing {r.spark.points.length}-quarter trend</div>
                        <SeriesChart
                          series={[
                            {
                              id: r.key,
                              label: r.name,
                              kind: "focal",
                              points: r.spark.points,
                            },
                          ]}
                          format={f}
                          height={150}
                          label={`${r.name} over ${r.spark.points.length} quarters`}
                        />
                        <div className="px-trend-caption">{r.spark.caption}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <StateBlock
                variant="empty"
                copy="No metric has both a peer distribution and a value for this filer in this period, so there is nothing to place it against."
              />
            )}
          </div>
          <div className="hub-note">{dist.note}</div>

          {/* segment & geographic mix — BOTH bars are this filer's own ASC 280 facts. The
              region bar previously drew a SECTOR aggregate against four fixed region names
              under a header claiming this company's 10-K; the members are now the ones the
              filer actually tagged, however many that is. */}
          <div className="p-card hub-mt-lg">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Segment &amp; geographic mix</span>
              <span className="hub-hint">
                ASC 280 · {T} 10-K{mix.fy ? ` · ${mix.fy}` : ""}
              </span>
            </div>
            {mix.ok ? (
              <>
                <div className="px-mix">
                  {([
                    ["By segment", mix.segments],
                    ["By region", mix.geography],
                  ] as const).map(([heading, band]) => (
                    <div key={heading}>
                      <div className="hub-label">{heading}</div>
                      {band.length ? (
                        <>
                          <div className="px-stackbar">
                            {band.map((b) => (
                              <div key={b.label} style={{ width: b.width, background: b.color }} />
                            ))}
                          </div>
                          <div className="px-legend-col">
                            {band.map((b) => (
                              <span key={b.label}>
                                <i style={{ background: b.color }} />
                                {b.label} <b>{b.pct ?? "N/A"}</b>
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="hub-note">
                          This filer tagged no {heading === "By segment" ? "segment" : "geographic"}{" "}
                          split under ASC 280.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="hub-note">{mix.note}</div>
              </>
            ) : (
              <StateBlock variant="empty" copy={mix.note} />
            )}
          </div>

          {/* Filing activity & flags — the FORM MIX over the indexed window, not a list of
              recent filings. The index carries form, date and 8-K item codes; a per-filing
              description is not in it, and the prototype's list was written rather than read.
              What a filer files, and how often, is a real and comparable fact about how it
              talks to the market. */}
          <div className="p-card hub-mt-lg">
            <div className="hub-panel-head is-split">
              <span className="hub-panel-title">Filing activity &amp; flags</span>
              <div className="px-flags">
                {fflags.chips.map((c) => (
                  <span
                    key={c.label}
                    className="qual-chip"
                    style={
                      c.kind === "event"
                        ? {
                            color: "var(--ext-color)",
                            background: "var(--ext-bg)",
                            borderColor: "var(--ext-border)",
                          }
                        : {
                            color: "var(--ink-soft)",
                            background: "transparent",
                            borderColor: "var(--border-strong)",
                          }
                    }
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
            {act.ok ? (
              <>
                <div className="hub-label">
                  {act.indexed} filings indexed · {act.window}
                </div>
                {act.forms.map((f) => (
                  <div className="px-filing-row" key={f.form}>
                    <span className="px-filing-form">{f.form}</span>
                    <span className="px-filing-desc" />
                    <span className="hub-cell-mono ta-r is-soft">{f.count}</span>
                  </div>
                ))}
                {act.formsRest ? <div className="hub-note">{act.formsRest}</div> : null}
                <div className="hub-note">
                  {act.amended} of them are amendments ({act.amendedPct}) — an amendment may be a
                  correction or a routine refiling, and the index cannot tell them apart.
                </div>
              </>
            ) : (
              <StateBlock variant="empty" copy={act.reason} />
            )}
            <div className="hub-note">{fflags.note}</div>
          </div>

          {/* ---------------------------------------------------------------- beyond */}
          <div className="px-beyond">
            <span className="px-beyond-title">Beyond the financials</span>
            <span className="hub-hint">
              how this filer compares on disclosure, accounting choice, governance, ownership and
              obligations
            </span>
          </div>
          <div className="hub-note">{beyond.note}</div>

          <div className="p-card hub-mt-lg" id={group.id}>
            <div className="px-group-head">
              <span className="px-group-n">{group.n}</span>
              <span className="hub-panel-title">{group.label}</span>
              <span className="hub-hint">{group.src}</span>
            </div>

            {/* A row either has a real figure or names why it has none. Nothing is dropped:
                a panel that quietly stops asking a question reads as a panel with fewer
                questions, not as one that could not answer them. */}
            {(beyond.groups[group.key] ?? []).map((r: BeyondRow) => (
              <div className="px-dist-row" key={r.key}>
                <div className="px-dist-head">
                  <span className="px-dist-name">
                    <span>{r.label}</span>
                  </span>
                  <span className="px-row-right">
                    <span className={`px-value${r.available ? "" : " is-soft"}`}>
                      {r.valueLabel}
                    </span>
                  </span>
                </div>
                {r.available && r.quantiles && r.focalVal !== null ? (
                  <PeerStrip
                    variant="cloud"
                    peers={r.peers}
                    marks={[{ id: "foc", label: T, value: r.focalVal, kind: "focal" }]}
                    quantiles={r.quantiles}
                    format={(v) => String(Math.round(v))}
                    axisLabels={false}
                    label={`${r.label} across the peer set`}
                  />
                ) : null}
                <div className="hub-note">{r.available ? r.note : r.reason}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
