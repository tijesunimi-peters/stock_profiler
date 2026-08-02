/**
 * Altitude 1 — Sector, ported from the prototype's own markup, copy and figures.
 *
 * Three numbered scopes: 01 health scorecard (tiles → provisional note → peer strip → geo mix
 * and insider flow), 02 what drives it (decomposition → biggest shifts), 03 distribution
 * (one dispersion panel with a This-theme / All-metrics scope toggle).
 *
 * The scorecard's delta is PLAIN MONO TEXT with a direction glyph — not a colored chip. That is
 * the prototype's choice and it is the honesty rule working: no metric on this page is tinted
 * good or bad.
 */
import { SectionHead } from "@ds";
import {
  BIGGEST_SHIFTS,
  CONSTITUENTS,
  EVENTS,
  GEO_COLORS,
  GEO_LABELS,
  GEO_MIX,
  INSIDER,
  SECTOR_ABBR,
  SECTOR_NAMES,
  SECTOR_SCORES,
  SEMI_DELTA,
  SUB_COUNTS,
  SUB_NAMES,
  THEMES,
  THEME_DRILL,
  AS_OF,
  ord,
  rankOf,
  statusDot,
} from "../../data/prototype";
import { PeerStrip } from "../../charts/strips";
import { useSelection } from "../../state";

export function SectorView() {
  const sel = useSelection();
  const si = sel.sectorIdx;
  const subActive = sel.subIdx >= 0;
  const n = SECTOR_NAMES.length;
  const rankSuffix = subActive
    ? `of ${SUB_COUNTS[sel.subIdx]} sub-industries`
    : `of ${n} sectors`;
  const et = THEMES.find((t) => t.id === sel.expanded) ?? THEMES[0];

  // ---------------------------------------------------------------- 02 decomposition
  const decompTheme = sel.decomp;
  const decomp = decompTheme
    ? (() => {
        const theme = THEMES.find((t) => t.id === decompTheme)!;
        const cons = CONSTITUENTS[decompTheme];
        const contribs = cons.map((c) => c[1] * c[2]);
        const maxC = Math.max(...contribs);
        const score = Math.round(contribs.reduce((a, b) => a + b, 0));
        return {
          title: `${theme.name} · ${score} composite`,
          method:
            "percentile-averaged, favorability-adjusted, vs 11 sectors — provisional weighting (§9)",
          rows: cons.map((c, i) => ({
            label: c[0],
            weightLabel: `w ${c[1].toFixed(2)}`,
            contribLabel: `+${contribs[i].toFixed(1)}`,
            pct: Math.round((contribs[i] / maxC) * 100),
          })),
        };
      })()
    : null;

  // ---------------------------------------------------------------- 03 dispersion
  const scopeAll = sel.drillScope === "all";
  // "All metrics" takes the first tile of every theme — one row per theme, not every metric.
  const drillSrc = scopeAll
    ? THEMES.flatMap((t) => (THEME_DRILL[t.id] ?? []).slice(0, 1))
    : (THEME_DRILL[sel.expanded] ?? []);
  const drillHeading = scopeAll ? "All-metric spreads · sector-wide" : `${et.name} · constituents`;

  const geo = GEO_MIX[si] ?? GEO_MIX[0];
  const ins = INSIDER[si] ?? INSIDER[0];
  const insGlyph = ins.dir === "up" ? "↑" : ins.dir === "down" ? "↓" : "→";

  return (
    <>
      {/* ================================================================ 01 */}
      <SectionHead
        n="01"
        title="Health scorecard"
        subtitle="Seven composite themes · percentile-averaged (provisional) · click a tile to focus it below; the peer strip shows where this sector stands"
      />

      <div className="scorecard">
        {THEMES.map((t) => {
          const score = SECTOR_SCORES[t.id][si];
          const rank = rankOf(t.id, si);
          const pctile = Math.round(((n - rank) / (n - 1)) * 100);
          const d = si === 0 ? SEMI_DELTA[t.id] : 0;
          const dGlyph = d > 0 ? "↑" : d < 0 ? "↓" : "→";
          const on = sel.expanded === t.id;
          return (
            <div
              key={t.id}
              className={`score-tile${on ? " is-expanded" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => sel.set({ expanded: t.id })}
              onKeyDown={(e) => e.key === "Enter" && sel.set({ expanded: t.id })}
            >
              <div className="score-tile-name">{t.name}</div>
              <div className="score-tile-row">
                <button
                  type="button"
                  className="score-tile-value"
                  onClick={(e) => {
                    // stopPropagation so opening the decomposition does not also re-focus the
                    // tile underneath it.
                    e.stopPropagation();
                    sel.set({ decomp: sel.decomp === t.id ? null : t.id, expanded: t.id });
                  }}
                  title="Open the decomposition"
                >
                  {score}
                </button>
                <span className="score-tile-delta">
                  {dGlyph} {d > 0 ? "+" : ""}
                  {d}
                </span>
              </div>
              <div className="score-tile-pctile">{ord(pctile)} pctile · vs all sectors</div>
              <div className="score-tile-rank">
                {ord(rank)} {rankSuffix}
              </div>
            </div>
          );
        })}
      </div>

      <div className="provisional-note">
        ≈ Scores provisional — final weighting/normalization not defined (see methodology §9).
        Every number is traceable and openable.
      </div>

      {/* Peer strip closes section 01: cross-sector standing on the focused theme. */}
      <div className="p-card">
        <div className="p-card-head">
          <span className="p-card-title">Where this sector sits</span>
          <span className="p-card-hint">
            {et.name.toLowerCase()} · {n} sectors · {AS_OF}
          </span>
        </div>
        <div className="peerstrip">
          {SECTOR_SCORES[sel.expanded].map((v, i) => {
            const max = Math.max(...SECTOR_SCORES[sel.expanded]);
            return (
              <button
                key={SECTOR_ABBR[i]}
                type="button"
                className={`peerstrip-bar${i === si ? " is-focal" : ""}`}
                onClick={() => sel.set({ sectorIdx: i, subIdx: -1 })}
                title={`${SECTOR_NAMES[i]} — ${v}`}
              >
                <span
                  className="peerstrip-fill"
                  style={{ height: `${Math.round((v / max) * 44)}px` }}
                />
                <span className="peerstrip-label">{SECTOR_ABBR[i]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sector-split">
        <div className="p-card">
          <div className="p-card-head is-inline">
            <span className="p-card-title">Geographic revenue mix</span>
            <span className="p-card-hint">ASC 280 segment disclosure · asset-weighted</span>
          </div>
          <div className="geo-bar">
            {geo.map((v, i) => (
              <div key={GEO_LABELS[i]} style={{ width: `${v}%`, background: GEO_COLORS[i] }} />
            ))}
          </div>
          <div className="geo-legend">
            {geo.map((v, i) => (
              <span key={GEO_LABELS[i]} className="geo-legend-item">
                <i style={{ background: GEO_COLORS[i] }} />
                {GEO_LABELS[i]} <b>{v}%</b>
              </span>
            ))}
          </div>
        </div>

        <div className="p-card">
          <div className="p-card-head is-inline">
            <span className="p-card-title">Insider flow</span>
            <span className="p-card-hint">Forms 3/4/5</span>
          </div>
          <div className="insider-head">
            <span className="insider-glyph">{insGlyph}</span>
            <span className="insider-ratio">{ins.ratio.toFixed(1)}×</span>
            <span className="p-card-hint">net buy/sell ($)</span>
          </div>
          <div className="insider-bar">
            <div style={{ width: `${(ins.buyers / (ins.buyers + ins.sellers)) * 100}%` }} />
            <div
              className="is-sell"
              style={{ width: `${(ins.sellers / (ins.buyers + ins.sellers)) * 100}%` }}
            />
          </div>
          <div className="insider-basis">
            {ins.buyers} buyers · {ins.sellers} sellers
          </div>
          <div className="insider-note">{ins.note}</div>
        </div>
      </div>

      {/* ================================================================ 02 */}
      <SectionHead
        n="02"
        title="What drives it"
        subtitle="Constituent decomposition of the focused theme · then the largest standardized moves vs the sector's own history"
      />

      {decomp && (
        <div className="p-card is-strong">
          <div className="decomp-head">
            <div className="decomp-title">{decomp.title}</div>
            <button type="button" className="decomp-close" onClick={() => sel.set({ decomp: null })}>
              − close
            </button>
          </div>
          <div className="decomp-method">{decomp.method}</div>
          {decomp.rows.map((r) => (
            <div className="decomp-row" key={r.label}>
              <span className="decomp-label">{r.label}</span>
              <span className="decomp-weight">{r.weightLabel}</span>
              <div className="contrib-bar">
                <div style={{ width: `${r.pct}%` }} />
              </div>
              <span className="decomp-contrib">{r.contribLabel}</span>
            </div>
          ))}
        </div>
      )}

      <div className="p-card">
        <div className="p-card-head is-inline">
          <span className="p-card-title">Biggest shifts</span>
          <span className="p-card-hint">largest standardized change vs own history</span>
        </div>
        {BIGGEST_SHIFTS.map((s) => (
          <div className="shift-row" key={s.name}>
            <span className="shift-glyph">{s.glyph}</span>
            <span className="shift-name">{s.name}</span>
            {s.flag && <span className="shift-flag">{s.flagLabel}</span>}
            <span className="shift-delta">{s.delta}</span>
            <span className="shift-basis">{s.basis}</span>
          </div>
        ))}
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
        {drillSrc.map((m) => (
          <div className="drill-tile" key={m.name}>
            <div className="drill-tile-head">
              <span className="drill-tile-name">{m.name}</span>
              <span className="drill-tile-median">
                median{" "}
                {/days|cycle/.test(m.name)
                  ? Math.round(m.median)
                  : m.median % 1 === 0
                    ? m.median
                    : m.median.toFixed(1)}
              </span>
            </div>
            <PeerStrip
              variant="track"
              quantiles={{ lo: m.lo, hi: m.hi, q1: m.q1, q3: m.q3, med: m.median }}
              format={(v) => String(Math.round(v * 10) / 10)}
              axisLabels={false}
              label={`${m.name} across the peer set`}
            />
            <div className="drill-tile-caption">{m.caption}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/** The right rail for the sector altitude: snapshot · what's moving · how to read this. */
export function SectorRail() {
  const sel = useSelection();
  const et = THEMES.find((t) => t.id === sel.expanded) ?? THEMES[0];
  const subActive = sel.subIdx >= 0;
  const peerCount = subActive ? SUB_COUNTS[sel.subIdx] : 62;
  const right = SECTOR_NAMES[sel.sectorIdx] + (subActive ? ` · ${SUB_NAMES[sel.subIdx]}` : "");

  const snapshot = [
    { k: "Filers", v: `${peerCount}${subActive ? " · sub" : ""}` },
    { k: "Period", v: AS_OF },
    { k: "Coverage", v: "94% filed" },
    { k: "Focused theme", v: et.name },
  ];

  return (
    <>
      <div className="rail-card">
        <div className="rail-label">Sector snapshot</div>
        <div className="rail-heading">{right}</div>
        <div className="rail-rows">
          {snapshot.map((s) => (
            <div className="rail-row" key={s.k}>
              <span className="rail-row-k">{s.k}</span>
              <span className="rail-row-v">{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Walled off from the analytical panels: this carries EVENTS, they carry STATE. */}
      <div className="rail-card is-tint">
        <div className="rail-card-head">
          <span className="rail-title">What&apos;s moving</span>
          <span className="rail-badge">Track 2</span>
        </div>
        <div className="rail-sub">Filing events · walled off from metrics</div>
        {EVENTS.map((e) => {
          const s = statusDot(e.sev);
          return (
            <div className="feed-row" key={e.title}>
              <span className="feed-dot" style={{ background: s.dot, border: s.border }} />
              <div>
                <div className="feed-title">{e.title}</div>
                <div className="feed-src">{e.source}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rail-card">
        <div className="rail-label">How to read this</div>
        <div className="rail-note">
          Scores are a position vs other sectors, not a good/bad or buy verdict. Every number is
          traceable — click a score to open its decomposition.
        </div>
        <a className="rail-link" href="/methodology">
          Methodology §9 ↗
        </a>
      </div>
    </>
  );
}
