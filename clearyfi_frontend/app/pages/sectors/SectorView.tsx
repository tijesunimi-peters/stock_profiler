/**
 * Altitude 1 — Sector, on real SEC data at SIC 2-digit.
 *
 * Three numbered scopes, keeping the prototype's structure: 01 health scorecard (tiles →
 * normalization note → cross-sector strip → geo mix and insider flow), 02 what drives it
 * (decomposition → biggest shifts), 03 distribution (spreads with a This-theme / All-metrics
 * scope toggle).
 *
 * The scorecard's delta is PLAIN MONO TEXT with a direction glyph — not a colored chip. That is
 * the prototype's choice and it is the honesty rule working: no metric on this page is tinted
 * good or bad. A theme score is a POSITION against other sectors, and the tiles say so.
 *
 * **What changed when the figures became real.** Every panel here had a synthetic twin, and three
 * of them could not survive contact with the data:
 *
 *   * *Two themes have no score.* Accounting quality and Structure & activity come back
 *     `scored: false` with the reason `normalize/themes.DEFERRED_THEMES` records. The prototype
 *     gave them 81 and 62. They render as unscored tiles — asked, and not answerable.
 *   * *The insider card's "1.4× net buy/sell" is not computable.* A buy/sell ratio is unbounded
 *     and undefined where insiders sold and never bought, which is the ordinary case. The card
 *     shows the net dollar figure and a composition bar.
 *   * *The geographic mix has no ingest behind it.* It renders its reason, not a bar.
 */
import { SectionHead, StateBlock } from "@ds";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { useSectorRoster } from "../../lib/useSectorRoster";
import { PeerStrip } from "../../charts/strips";
import { useSelection } from "../../state";
import { ord } from "../../data/sector-catalog";

/**
 * The strip's bars run 0–100 on a FIXED domain, not scaled to the tallest.
 *
 * A theme score is already an index — 50 is the cross-sector average and ±1σ is about 15 points —
 * so normalizing to the maximum would redraw the same distribution as though the leader were
 * perfect. The tallest bar on a tight theme should look short.
 */
const STRIP_HEIGHT_PX = 96;

/** Percent of a whole, for the geo bar. Formatting, not arithmetic on a figure. */
const pct1 = (v: number) => `${v.toFixed(1)}%`;

export function SectorView() {
  const sel = useSelection();
  const { roster, error: rosterError } = useSectorRoster();

  const read = useApi(
    () => (roster ? api.sectorOverview(sel.sectorGroup, roster.fiscalYear) : new Promise<never>(() => {})),
    [sel.sectorGroup, roster?.fiscalYear],
  );

  if (rosterError) return <StateBlock variant="error" copy={rosterError.message} />;
  if (read.error) return <StateBlock variant="error" copy={read.error.message} />;
  if (!read.data) return <StateBlock variant="loading" copy="Reading this sector's aggregates." />;

  const d = read.data;

  if (!d.themes.length) {
    return (
      <StateBlock
        variant="empty"
        copy={
          `No composite theme scores have been computed for SIC ${d.group}. A sector is scored only ` +
          `when enough of its filers have materialized metrics to place it against the others.`
        }
      />
    );
  }

  /*
   * The focused theme comes from the URL, and the URL is not validated against the payload (see
   * `state.tsx`) — so a link naming a theme this sector does not carry focuses the first one it
   * does, rather than rendering an empty page.
   */
  const focused = d.themes.find((t) => t.key === sel.expanded) ?? d.themes[0];
  const decomp = sel.decomp ? d.themes.find((t) => t.key === sel.decomp) ?? null : null;
  const stripBars = d.strip[focused.key] ?? [];

  // ---------------------------------------------------------------- 03 dispersion
  //
  // "This theme" intersects the focused theme's constituents with the metrics that actually have a
  // materialized five-number summary — ten of them. The intersection is genuinely empty for Cash &
  // investment, and that scope reports "0 of 2" rather than silently widening to all metrics.
  const scopeAll = sel.drillScope === "all";
  const themeMetrics = new Set(focused.constituents.map((c) => c.metric));
  const drillSrc = scopeAll ? d.spreads : d.spreads.filter((m) => themeMetrics.has(m.metric));
  const drillHeading = scopeAll
    ? `All materialized spreads · ${d.spreads.length} metrics`
    : `${focused.label} · ${drillSrc.length} of ${focused.constituents.length} constituents have a spread`;

  return (
    // The wrapper exists to scope this altitude's section-header scale (12/20) without
    // re-tuning the design system's own, which other surfaces share.
    <div className="sector-alt">
      {/* ================================================================ 01 */}
      <SectionHead
        n="01"
        title="Health scorecard"
        subtitle="Seven composite themes · equal-weight mean of z-scored sector medians · click a tile to focus it below; the strip shows where this sector stands against every other"
      />

      <div className="scorecard">
        {d.themes.map((t) => {
          const on = focused.key === t.key;
          const dGlyph = t.delta == null ? "" : t.delta > 0 ? "↑" : t.delta < 0 ? "↓" : "→";
          return (
            <div
              key={t.key}
              className={`score-tile${on ? " is-expanded" : ""}${t.scored ? "" : " is-unscored"}`}
              role="button"
              tabIndex={0}
              onClick={() => sel.set({ expanded: t.key })}
              onKeyDown={(e) => e.key === "Enter" && sel.set({ expanded: t.key })}
            >
              <div className="score-tile-name">{t.label}</div>
              {t.scored && t.score != null ? (
                <>
                  <div className="score-tile-row">
                    <button
                      type="button"
                      className="score-tile-value"
                      onClick={(e) => {
                        // stopPropagation so opening the decomposition does not also re-focus the
                        // tile underneath it.
                        e.stopPropagation();
                        sel.set({ decomp: sel.decomp === t.key ? null : t.key, expanded: t.key });
                      }}
                      title="Open the decomposition"
                    >
                      {t.score}
                    </button>
                    {/* No delta is not a flat delta: a theme with no prior-year score says nothing. */}
                    <span className="score-tile-delta">
                      {t.delta == null ? "no prior FY" : `${dGlyph} ${t.delta > 0 ? "+" : ""}${t.delta}`}
                    </span>
                  </div>
                  <div className="score-tile-pctile">
                    {t.percentile == null ? "percentile N/A" : `${ord(Math.round(t.percentile))} pctile`} · vs all
                    sectors
                  </div>
                  {/*
                    `rank_of` is PER THEME and differs — 7th of 63 on financial health, 20th of 61
                    on cash & investment — because a sector missing a constituent is not scored on
                    that theme rather than scored low. A bare "20th" would flatten that away.
                  */}
                  <div className="score-tile-rank">
                    {t.rank == null || t.rankOf == null
                      ? "rank N/A"
                      : `${ord(t.rank)} of ${t.rankOf} sectors scored`}
                  </div>
                </>
              ) : (
                <>
                  <div className="score-tile-row">
                    <span className="score-tile-value is-na">∅</span>
                    <span className="score-tile-delta">not scored</span>
                  </div>
                  <div className="score-tile-unscored">{t.reason ?? "No score is computed for this theme."}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The method, in the server's own words — not a placeholder standing in for one. */}
      {d.normalization && <div className="provisional-note">≈ {d.normalization}</div>}

      {/* Strip closes section 01: cross-sector standing on the focused theme. */}
      <div className="p-card">
        <div className="p-card-head">
          <span className="p-card-title">Where this sector sits</span>
          <span className="p-card-hint">
            {focused.label.toLowerCase()} · {stripBars.length} sectors scored · FY {d.fiscalYear}
          </span>
        </div>
        {stripBars.length ? (
          <>
            {/*
              Read-only, as in the prototype. The strip's job is to place this sector among the
              others on the focused theme; the sector selector in the control bar is the one place
              that changes which sector you are reading, and having two would split that.
            */}
            <div className="peerstrip is-dense">
              {stripBars.map((b) => (
                <div
                  key={b.group}
                  className={`peerstrip-bar${b.group === d.group ? " is-focal" : ""}`}
                  title={`${b.group} ${b.label} — ${b.score}`}
                >
                  <span
                    className="peerstrip-fill"
                    style={{ height: `${Math.round((b.score / 100) * STRIP_HEIGHT_PX)}px` }}
                  />
                  <span className="peerstrip-label">{b.group}</span>
                </div>
              ))}
            </div>
            <div className="drill-tile-caption">
              One bar per SIC major group, tallest score first; this sector is accented. Bars run on
              a fixed 0–100 scale, so a tight theme looks flat rather than being stretched to fill
              the panel. A sector not scored on this theme has no bar — it is absent, not zero.
            </div>
          </>
        ) : (
          <StateBlock variant="empty" copy={`No sector is scored on ${focused.label.toLowerCase()}.`} />
        )}
      </div>

      <div className="sector-split">
        <div className="p-card">
          <div className="p-card-head is-inline">
            <span className="p-card-title">Geographic revenue mix</span>
            {/*
              The mix's OWN fiscal year, which is not guaranteed to be the scorecard's. The batch
              writes one row per group for whichever annual basis it was last run on, and the DERA
              quarterly ZIPs it reads land a fiscal year at a time — so a group whose filers report
              on a different calendar can carry a different year from §01. Same class of silent
              mismatch as the spreads year, and named the same way rather than assumed away.
            */}
            <span className="p-card-hint">
              ASC 280 · revenue-weighted
              {d.geographic.ok && d.geographic.fiscalYear != null
                ? ` · FY ${d.geographic.fiscalYear}${
                    d.geographic.fiscalYear !== d.fiscalYear ? " ⚠ not the scorecard's year" : ""
                  }`
                : ""}
            </span>
          </div>
          {d.geographic.ok ? (
            <>
              <div className="geo-bar">
                {d.geographic.mix.map((m) => (
                  <div key={m.key} className={`geo-seg is-${m.key}`} style={{ width: `${m.pct}%` }} />
                ))}
              </div>
              <div className="geo-legend">
                {d.geographic.mix.map((m) => (
                  <span key={m.key} className="geo-legend-item">
                    <i className={`geo-seg is-${m.key}`} />
                    {m.label} <b>{pct1(m.pct)}</b>
                  </span>
                ))}
              </div>
              <div className="drill-tile-caption">
                {d.geographic.companyCount} of {d.geographic.inScope} filers disclose a geographic
                split
                {d.geographic.coveredShare != null
                  ? `, covering ${pct1(d.geographic.coveredShare * 100)} of the sector's revenue`
                  : ""}
                {d.geographic.excluded > 0
                  ? ` · ${d.geographic.excluded} excluded because their splits did not reconcile to consolidated revenue`
                  : ""}
                .
              </div>
            </>
          ) : (
            <StateBlock variant="empty" copy={d.geographic.note} />
          )}
        </div>

        <div className="p-card">
          <div className="p-card-head is-inline">
            <span className="p-card-title">Insider flow</span>
            <span className="p-card-hint">Forms 3/4/5 · open-market only</span>
          </div>
          {d.insider.ok ? (
            <>
              <div className="insider-head">
                <span className="insider-glyph">{d.insider.net > 0 ? "↑" : d.insider.net < 0 ? "↓" : "→"}</span>
                <span className="insider-ratio">{d.insider.netLabel}</span>
                <span className="p-card-hint">net, {d.insider.window ?? "trailing window"}</span>
              </div>
              <div className="insider-bar">
                <div style={{ width: `${d.insider.buyShare}%` }} />
                <div className="is-sell" style={{ width: `${100 - d.insider.buyShare}%` }} />
              </div>
              <div className="insider-basis">
                {d.insider.buyCount} buys · {d.insider.sellCount} sells · {d.insider.filerCount} filers
                across {d.insider.companyCount} companies
              </div>
              {/*
                The single most important thing about this number, and the commonest way the data
                is misread. Grants and tax withholding are not decisions to trade.
              */}
              <div className="insider-note">
                Codes P and S only — grants, option exercises and tax withholding are excluded.
                {d.insider.excluded > 0
                  ? ` ${d.insider.excluded} transactions reported no price and are excluded, not counted as $0.`
                  : ""}
              </div>
            </>
          ) : (
            <StateBlock variant="empty" copy={d.insider.note} />
          )}
        </div>
      </div>

      {/* ================================================================ 02 */}
      <SectionHead
        n="02"
        title="What drives it"
        subtitle="Constituent decomposition of the focused theme · then the themes that moved most against the prior fiscal year"
      />

      {decomp && decomp.scored && (
        <div className="p-card is-strong">
          <div className="decomp-head">
            <div className="decomp-title">
              {decomp.label} · {decomp.score} composite
            </div>
            <button type="button" className="decomp-close" onClick={() => sel.set({ decomp: null })}>
              − close
            </button>
          </div>
          <div className="decomp-method">
            equal-weight mean of {decomp.constituents.length} favourability-oriented z-scores, vs{" "}
            {decomp.rankOf ?? "the"} scored sectors
          </div>
          {decomp.constituents.map((c) => {
            const z = c.z;
            /*
             * The bar is |z| against the widest constituent in THIS theme, and the sign is carried
             * by the row's direction glyph rather than by the bar's length. A z of -1.5 is a large
             * contribution in the negative direction, and drawing it as a short bar would read as
             * a small one.
             */
            const maxAbs = Math.max(...decomp.constituents.map((x) => Math.abs(x.z ?? 0)), 0.001);
            return (
              <div className="decomp-row" key={c.metric}>
                <span className="decomp-label">
                  {c.label}
                  {!c.higherIsBetter && <span className="decomp-dir" title="lower is better">↓ better</span>}
                </span>
                <span className="decomp-weight">w {(1 / decomp.constituents.length).toFixed(2)}</span>
                <div className="contrib-bar">
                  <div
                    className={z != null && z < 0 ? "is-neg" : ""}
                    style={{ width: `${Math.round((Math.abs(z ?? 0) / maxAbs) * 100)}%` }}
                  />
                </div>
                <span className="decomp-contrib">
                  {z == null ? "N/A" : `${z > 0 ? "+" : ""}${z.toFixed(2)}σ`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-card">
        <div className="p-card-head is-inline">
          <span className="p-card-title">Biggest shifts</span>
          <span className="p-card-hint">theme score vs prior fiscal year</span>
        </div>
        {d.shifts.length ? (
          d.shifts.map((s) => (
            <div className="shift-row" key={s.key}>
              <span className="shift-glyph">{s.delta! > 0 ? "↑" : "↓"}</span>
              <span className="shift-name">{s.label}</span>
              <span className="shift-delta">
                {s.delta! > 0 ? "+" : ""}
                {s.delta} pts
              </span>
              <span className="shift-basis">
                now {s.score} · {s.rank != null && s.rankOf != null ? `${ord(s.rank)} of ${s.rankOf}` : "rank N/A"}
              </span>
            </div>
          ))
        ) : (
          /*
           * A real and unremarkable answer: a sector whose scores did not move. The prototype could
           * not produce it, because its shifts were a fixed list.
           */
          <StateBlock
            variant="empty"
            copy="No theme score moved against the prior fiscal year, or no prior year is scored for this sector."
          />
        )}
      </div>

      {/* ================================================================ 03 */}
      <SectionHead
        n="03"
        title="Distribution"
        subtitle="How spread out the filers are · band = IQR · tick = median"
      />

      <div className="p-card">
        <div className="p-card-head">
          <span className="drill-heading">{drillHeading}</span>
          <div className="scope-toggle">
            {(
              [
                ["theme", "This theme"],
                ["all", "All metrics"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`scope-btn${sel.drillScope === k ? " is-active" : ""}`}
                onClick={() => sel.set({ drillScope: k })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* The spread year is shown because it is PINNED to the roster's and could drift. */}
        {d.spreadYear != null && d.spreadYear !== d.fiscalYear && (
          <div className="drill-tile-caption">
            ⚠ These spreads are FY {d.spreadYear}; the scorecard above is FY {d.fiscalYear}.
          </div>
        )}
        {drillSrc.length ? (
          drillSrc.map((m) => {
            const f = (v: number) => (m.unit === "ratio" ? v.toFixed(3) : String(Math.round(v)));
            return (
              <div className="drill-tile" key={m.metric}>
                <div className="drill-tile-head">
                  <span className="drill-tile-name">{m.label}</span>
                  <span className="drill-tile-median">median {f(m.median)}</span>
                </div>
                {/*
                 * The quartiles are PRINTED as well as drawn, because real spreads have real
                 * outliers. Revenue growth in group 36 runs −0.41 to +9.8 against a median of
                 * 0.06, so the middle half is a hairline on any axis wide enough to hold the
                 * maximum. The band is still the right picture — it shows exactly that the
                 * dispersion is one-sided — but a reader should not have to measure it.
                 */}
                <div className="drill-tile-quartiles">
                  <span>min {f(m.lo)}</span>
                  <span>p25 {f(m.q1)}</span>
                  <span>p75 {f(m.q3)}</span>
                  <span>max {f(m.hi)}</span>
                </div>
                <PeerStrip
                  variant="track"
                  quantiles={{ lo: m.lo, hi: m.hi, q1: m.q1, q3: m.q3, med: m.median }}
                  format={(v) => (m.unit === "ratio" ? v.toFixed(2) : String(Math.round(v)))}
                  axisLabels={false}
                  label={`${m.label} across the peer set`}
                />
                <div className="drill-tile-caption">
                  {m.peerCount} filers reported this for FY {d.spreadYear ?? d.fiscalYear}. A filer
                  with no value is excluded, never counted low.
                </div>
              </div>
            );
          })
        ) : (
          <StateBlock
            variant="empty"
            copy={
              scopeAll
                ? `No metric has a materialized spread for SIC ${d.group} in FY ${d.fiscalYear}. A sector below the minimum group size is dropped rather than shown as sparse.`
                : `None of ${focused.label}'s ${focused.constituents.length} constituents has a materialized five-number summary, so this theme has no spread to show. Switch to All metrics for the ones that do.`
            }
          />
        )}
      </div>
    </div>
  );
}

/** The right rail for the sector altitude: snapshot · what's moving · how to read this. */
export function SectorRail() {
  const sel = useSelection();
  const { roster } = useSectorRoster();
  // Its own read: the rail rides every sector view, including the two this file does not render.
  const read = useApi(
    () => (roster ? api.sectorOverview(sel.sectorGroup, roster.fiscalYear) : new Promise<never>(() => {})),
    [sel.sectorGroup, roster?.fiscalYear],
  );

  if (read.error) return <StateBlock variant="error" copy={read.error.message} />;
  if (!read.data) return <StateBlock variant="loading" copy="Reading this sector's snapshot." />;
  const d = read.data;
  const focused = d.themes.find((t) => t.key === sel.expanded) ?? d.themes[0] ?? null;

  const snapshot = [
    { k: "Filers", v: d.filerCount == null ? "N/A" : String(d.filerCount) },
    { k: "Period", v: `FY ${d.fiscalYear}` },
    { k: "Period end", v: d.periodEnd ?? "N/A" },
    { k: "Basis", v: roster?.peerBasis ?? "SIC 2-digit" },
    { k: "Focused theme", v: focused?.label ?? "—" },
  ];

  return (
    <>
      <div className="rail-card">
        <div className="rail-label">Sector snapshot</div>
        {/*
          The OVERVIEW's label, not the roster's. Four groups have theme scores but no DuPont
          aggregate, so they are absent from the navigable roster and reachable only by URL —
          `label()` would call one of them "SIC 07" where the overview knows it is Agricultural
          Services. Where both know it they agree, because both ultimately quote `group_label`.
        */}
        <div className="rail-heading">
          {d.group} · {d.label}
        </div>
        <div className="rail-rows">
          {snapshot.map((s) => (
            <div className="rail-row" key={s.k}>
              <span className="rail-row-k">{s.k}</span>
              <span className="rail-row-v">{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/*
        The prototype's "What's moving" feed carried four invented filing events — "3 auditor
        changes this quarter", that kind of thing — attributed to Track 2. There is no sector-grain
        filing feed: `filing_index` is per company and nothing rolls 8-K item codes up to a SIC
        group. The card keeps its place and says that, rather than being deleted (which would hide
        that the question was asked) or filled (which is what it did before).
      */}
      <div className="rail-card is-tint">
        <div className="rail-card-head">
          <span className="rail-title">What&apos;s moving</span>
          <span className="rail-badge">not built</span>
        </div>
        <div className="rail-sub">Filing events · walled off from metrics</div>
        <div className="rail-note">
          No filing-event feed exists at sector grain. The filing index is per company, and 8-K item
          codes are not rolled up to a SIC group — so there is nothing to show here that would not
          be assembled on the spot.
        </div>
      </div>

      <div className="rail-card">
        <div className="rail-label">How to read this</div>
        <div className="rail-note">
          Scores are a position vs other sectors, not a good/bad or buy verdict. SIC 2-digit is
          coarse — group 28 holds pharmaceuticals and biotech together, and semiconductors are about
          a third of group 36. Every number is traceable: click a score to open its decomposition.
        </div>
        <a className="rail-link" href="/methodology">
          Methodology §9 ↗
        </a>
      </div>
    </>
  );
}
