/**
 * Company Hub → Overview.
 *
 * The per-theme percentile rail and the composite rank card sit above the metric tiles: at
 * company altitude the reader wants POSITION first ("where does this filer sit?") and the raw
 * ratio second (00 §4).
 */
import { MetricCardGrid, MetricCard, ChartCard, SectionHead, StatusChip, Provenance } from "@ds";
import type { MetricValue } from "@ds";
import type { CompanySurface } from "../../data/surfaces";
import { METRIC_BY_KEY } from "../../data/catalog";
import { humanDate, pctile } from "../../lib/format";
import { PctBar, RankBadge, StackedBar } from "../../ui/primitives";
import { useSelection } from "../../state";
import { navigate } from "../../router";

export function OverviewView({ surface }: { surface: CompanySurface }) {
  const sel = useSelection();

  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Where this filer sits" />

        <div className="split-60-40">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Percentile by theme</span>
              <span className="panel-hint">within the peer set</span>
            </div>
            <div className="rows">
              {surface.themeRail.map((t) => (
                <div className="row" key={t.theme}>
                  <span className="row-main">{t.label}</span>
                  {t.percentile == null ? (
                    <span className="pairbars-absent">
                      <StatusChip status="na" /> {t.reason}
                    </span>
                  ) : (
                    <>
                      <div style={{ width: 150 }}>
                        <PctBar value={t.percentile} emphasis={false} />
                      </div>
                      <span className="row-num">{pctile(t.percentile)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="panel-note" style={{ marginTop: 10 }}>
              Percentiles here are <b>within {surface.sector.short}</b>, never cross-sector. A
              theme with no scoreable constituent is marked N/A rather than given a middling
              placeholder.
            </p>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Composite rank</span>
              <span className="panel-hint">provisional</span>
            </div>
            <div className="score-tile-row">
              <span className="score-tile-value">{surface.compositeRank.score ?? "N/M"}</span>
              <StatusChip status={surface.compositeRank.score == null ? "nm" : "approximate"} />
            </div>
            <div style={{ marginTop: 6 }}>
              <RankBadge
                rank={surface.compositeRank.rank}
                of={surface.compositeRank.of}
                basis={`filers in ${surface.sector.short}`}
              />
            </div>
            <Provenance
              formula="Mean of the filer's theme percentiles within its peer set"
              basis="TTM"
              restatementBasis="as-restated"
              asOf={surface.asOf}
              status="approximate"
              reason="A provisional rollup. Themes whose constituents this filer does not tag are excluded rather than treated as median."
            />
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title="Headline metrics" />
        <MetricCardGrid>
          {surface.tiles.map((t) => {
            const def = METRIC_BY_KEY[t.key];
            const mv: MetricValue = {
              metric: t.key,
              label: t.label,
              value: t.value,
              display: t.status === "na" || t.status === "nm" ? undefined : t.display,
              status: t.status,
              reason: t.reason,
              basis: def.unit === "x" || def.unit === "days" ? "as-of" : "TTM",
              restatementBasis: "as-restated",
              asOf: surface.asOf,
            };
            return <MetricCard key={t.key} metric={mv} formula={def.formula} />;
          })}
        </MetricCardGrid>
        <p className="panel-note">
          Period-over-period moves: {surface.tiles.map((t) => `${t.label} ${t.move}`).join(" · ")}
        </p>
      </section>

      <section className="section">
        <SectionHead n="03" title="Segment & geographic mix" />
        <div className="grid-2">
          <ChartCard title="By segment" caption={surface.segmentCoverage}>
            <StackedBar parts={surface.segments.map((s) => ({ key: s.key, label: s.label, share: s.share }))} />
          </ChartCard>
          <ChartCard
            title="By geography"
            caption="ASC 280 geographic footnote. Regions are the filer's own bucketing — two filers' 'Asia-Pacific' need not mean the same countries."
          >
            <StackedBar parts={surface.geography.map((g) => ({ key: g.key, label: g.label, share: g.share }))} />
          </ChartCard>
        </div>
      </section>

      <section className="section">
        <SectionHead n="04" title="Filing history & flags" />

        <div className="panel">
          <div className="rows">
            {surface.flags.map((f) => (
              <div className="row" key={f.label}>
                <span className="row-main">
                  <span className="row-title">{f.label}</span>
                  <div className="row-sub">{f.note}</div>
                </span>
                <span className={`form-badge${f.present && f.label !== "Timely filer" ? " is-flag" : ""}`}>
                  {f.present ? "yes" : "no"}
                </span>
              </div>
            ))}
          </div>
          <p className="panel-note" style={{ marginTop: 10 }}>
            Flags are <b>categorical</b>, not a severity scale. A restatement is a different kind
            of fact from a low margin, and it is never rendered on the same color ramp.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Recent filings</span>
            <span className="panel-hint">bounded index window · newest first</span>
          </div>
          <div className="rows">
            {surface.filings.map((f) => (
              <div className="row" key={f.id}>
                <span className="form-badge">{f.form}</span>
                <span className="row-main">
                  <span className="row-title">{f.note}</span>
                  <div className="row-sub">{f.accession}</div>
                </span>
                <span className="row-num">{humanDate(f.filed)}</span>
              </div>
            ))}
          </div>
          <p className="panel-note" style={{ marginTop: 10 }}>
            This index covers EDGAR's rolling recent window, not the filer's whole history.
            "None on file" over this window is not "none ever".
          </p>
        </div>

        <button
          type="button"
          className="linkish"
          onClick={() => navigate(sel.href(`/company/${surface.filer.symbol}/peers`))}
        >
          See how this filer compares to its peers →
        </button>
      </section>
    </>
  );
}
