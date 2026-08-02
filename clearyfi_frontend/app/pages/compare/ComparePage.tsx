/**
 * `/compare/sectors` and `/compare/companies`.
 *
 * The prototype used one word, "Compare", for two different comparisons. They are split here so
 * a route says which one it is (RECONCILIATION §2).
 *
 * No winner is declared on either. Bars are true-length; an inverted metric gets a text marker
 * rather than a flipped fill; A/B color is categorical identity, not a verdict.
 */
import { ChartCard, SectionHead, SegmentedControl, StateBlock, StatTile, StatTileRow, StatusChip, STANDARD_DISCLOSURES } from "@ds";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { FILERS, SECTORS } from "../../data/catalog";
import { fmt, signed } from "../../lib/format";
import { MiniPairs, PairBars } from "../../ui/primitives";
import { RadarChart } from "../../charts/misc";
import { SpreadOverlay } from "../../charts/strips";

const VIEWS = [
  { value: "sectors", label: "Sector vs sector" },
  { value: "companies", label: "Company vs company" },
];

export function ComparePage({ view }: { view: "sectors" | "companies" }) {
  return view === "companies" ? <CompanyCompare /> : <SectorCompare />;
}

// ---------------------------------------------------------------------------- sectors

function SectorCompare() {
  const sel = useSelection();
  const aId = SECTORS[sel.compareA]?.id ?? SECTORS[0].id;
  const bId = SECTORS[sel.compareB]?.id ?? SECTORS[1].id;
  const res = useApi(() => api.compareSectors(aId, bId, sel.period), [
    aId,
    bId,
    sel.period,
  ]);
  const d = res.data;

  return (
    <PageShell
      subject="compare"
      title="Compare sectors"
      right={[`Period ${sel.period}`, d ? `A · ${d.a.short}` : "—", d ? `B · ${d.b.short}` : "—"].filter(Boolean).join(" · ")}
      subtitle="Two peer sets side by side. Nothing here declares a winner — bars are true-length, and A/B color is identity rather than a verdict."
      controlBar={
        <div className="ctrlbar">
          <div className="ctrlbar-row">
            <span className="ctrlbar-label">A</span>
            {SECTORS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`pill${sel.compareA === i ? " is-active" : ""}`}
                onClick={() => sel.set({ compareA: i })}
              >
                {s.short}
              </button>
            ))}
          </div>
          <div className="ctrlbar-row">
            <span className="ctrlbar-label">B</span>
            {SECTORS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`pill is-sub${sel.compareB === i ? " is-active" : ""}`}
                onClick={() => sel.set({ compareB: i })}
              >
                {s.short}
              </button>
            ))}
          </div>
          {d && (
            <div className="ctrlbar-meta">
              <span>
                A coverage <b>{d.coverageA.pct}%</b> · {d.a.filers} filers
              </span>
              <span>
                B coverage <b>{d.coverageB.pct}%</b> · {d.b.filers} filers
              </span>
              <span>
                {d.coverageA.sameStore || d.coverageB.sameStore
                  ? "at least one side is below the coverage threshold — read the gap as provisional"
                  : "both sides above the coverage threshold"}
              </span>
            </div>
          )}
        </div>
      }
      views={VIEWS}
      activeView="sectors"
      onView={(v) => navigate(sel.href(`/compare/${v}`))}
      disclosures={[
        "Composite scores on both sides are provisional and use the same placeholder rollup. A gap between two provisional numbers is itself provisional.",
        "Metric medians are compared on their own normalized bars; the raw value sits at the bar end so a normalized length is never mistaken for a level.",
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {res.loading && !d && <StateBlock variant="loading" copy="Building both peer sets." />}
      {d && (
        <>
          <section className="section">
            <SectionHead n="01" title="Composite scores" />
            <div className="panel">
              <div className="rows">
                {d.themes.map((t) => (
                  <div className="row" key={t.theme}>
                    <span className="row-main">
                      <span className="row-title">{t.label}</span>
                      {t.gap != null && Math.abs(t.gap) >= 10 && (
                        <div className="row-sub">gap of {Math.abs(t.gap)} points — the widest class of difference on this page</div>
                      )}
                    </span>
                    <div style={{ flex: "0 0 260px" }}>
                      <PairBars
                        aLabel={d.a.short}
                        bLabel={d.b.short}
                        rows={[
                          {
                            key: t.theme,
                            label: "",
                            a: t.a,
                            b: t.b,
                            display: (v) => String(Math.round(v)),
                            aReason: t.a == null ? "no scoreable constituent for this theme" : null,
                            bReason: t.b == null ? "no scoreable constituent for this theme" : null,
                          },
                        ]}
                      />
                    </div>
                    <span className="row-num">
                      {t.gap == null ? "N/M" : `${signed(t.gap)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="section">
            <SectionHead n="02" title="Composite profile" />
            <ChartCard
              title="Seven themes, two sectors"
              caption="Each axis is a provisional composite, 0–100. Read the SHAPE, not the area: the axes are different measures and the enclosed area has no meaning."
            >
              <RadarChart
                axes={d.themes.map((t) => t.short)}
                series={[
                  { id: "a", label: d.a.short, kind: "a", values: d.themes.map((t) => t.a) },
                  { id: "b", label: d.b.short, kind: "b", values: d.themes.map((t) => t.b) },
                ]}
                height={360}
                label="Composite profile radar"
              />
            </ChartCard>
          </section>

          <section className="section">
            <SectionHead n="03" title="Metric medians & spread" />
            {d.metrics.map((m) => (
              <ChartCard
                key={m.key}
                title={m.label}
                caption="Paired medians above, and both middle-half bands overlaid on one shared axis below — a sector can have the higher median and the wider spread at the same time."
              >
                <PairBars
                  aLabel={d.a.short}
                  bLabel={d.b.short}
                  rows={[
                    {
                      key: m.key,
                      // The card title already names the metric — captions and labels dedupe.
                      label: "",
                      a: m.aMed,
                      b: m.bMed,
                      inverted: m.inverted,
                      display: (v) => fmt(v, m.unit as never),
                      aReason: null,
                      bReason: null,
                    },
                  ]}
                />
                <div style={{ marginTop: 10 }}>
                  <SpreadOverlay
                    bands={[
                      { id: "a", label: d.a.short, kind: "a", ...m.aDist },
                      { id: "b", label: d.b.short, kind: "b", ...m.bDist },
                    ]}
                    format={(v) => fmt(v, m.unit as never)}
                    label={`${m.label} spread`}
                  />
                </div>
              </ChartCard>
            ))}
          </section>
        </>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------- companies

function CompanyCompare() {
  const sel = useSelection();
  const res = useApi(() => api.compareCompanies(sel.compareX, sel.compareY, sel.period), [
    sel.compareX,
    sel.compareY,
    sel.period,
  ]);
  const d = res.data;
  const aligned = d ? d.basisItems.filter((b) => b.aligned).length : 0;

  return (
    <PageShell
      subject="compare"
      title="Compare companies"
      right={[`Period ${sel.period}`, d ? `${d.x.symbol} vs ${d.y.symbol}` : "—"].filter(Boolean).join(" · ")}
      subtitle="Two filers side by side — starting with whether the comparison is valid at all."
      controlBar={
        <div className="ctrlbar">
          <div className="ctrlbar-row">
            <span className="ctrlbar-label">A</span>
            <SegmentedControl
              options={FILERS.slice(0, 6).map((f) => ({ value: f.symbol, label: f.symbol }))}
              value={sel.compareX}
              onChange={(v) => sel.set({ compareX: v })}
            />
          </div>
          <div className="ctrlbar-row">
            <span className="ctrlbar-label">B</span>
            <SegmentedControl
              options={FILERS.slice(0, 6).map((f) => ({ value: f.symbol, label: f.symbol }))}
              value={sel.compareY}
              onChange={(v) => sel.set({ compareY: v })}
            />
          </div>
        </div>
      }
      views={VIEWS}
      activeView="companies"
      onView={(v) => navigate(sel.href(`/compare/${v}`))}
      disclosures={[
        "A measure only one filer tags is EXCLUDED from the comparison rather than shown as zero. The count of shared measures is stated before any comparison.",
        STANDARD_DISCLOSURES.financials_floor,
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {res.loading && !d && <StateBlock variant="loading" copy="Reading both filers." />}
      {d && (
        <>
          {/* Comparison validity is stated BEFORE the comparison (RECONCILIATION §4.6). */}
          <section className="section">
            <SectionHead n="01" title="Is this comparison valid?" />
            <StatTileRow>
              <StatTile
                label="Filing basis"
                value={`${aligned} of ${d.basisItems.length}`}
                note="items line up between the two filers"
              />
              <StatTile
                label="Shared measures"
                value={`${d.sharedCount} of ${d.totalCount}`}
                note="tagged by both filers for this period"
              />
            </StatTileRow>
            <div className="panel">
              <div className="rows">
                {d.basisItems.map((b) => (
                  <div className="row" key={b.label}>
                    <StatusChip status={b.aligned ? "ok" : "approximate"} glyphOnly />
                    <span className="row-main">
                      <span className="row-title">{b.label}</span>
                      <div className="row-sub">{b.aligned ? "aligned" : "differs"}</div>
                    </span>
                    <span className="metric-row-caption" style={{ flex: "0 0 46%" }}>
                      {b.note}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="section">
            <SectionHead n="02" title="What can be compared" />
            <div className="panel">
              <PairBars
                aLabel={d.x.symbol}
                bLabel={d.y.symbol}
                rows={d.rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  a: r.a,
                  b: r.b,
                  inverted: r.inverted,
                  display: (v) => fmt(v, r.unit as never),
                  aReason: r.aReason,
                  bReason: r.bReason,
                }))}
              />
            </div>
          </section>

          <section className="section">
            <SectionHead n="03" title="Side by side, mixed units" />
            <div className="panel">
              <MiniPairs
                aLabel={d.x.symbol}
                bLabel={d.y.symbol}
                panels={d.rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  a: r.a,
                  b: r.b,
                  display: (v) => fmt(v, r.unit as never),
                }))}
              />
            </div>
            <p className="panel-note">
              One axis per panel, because the units differ. Putting margins and day-counts on one
              axis would make the longer bar look like the bigger number.
            </p>
          </section>
        </>
      )}
    </PageShell>
  );
}
