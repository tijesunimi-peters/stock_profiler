/**
 * 04 · Qualitative view (HANDOFF §5.4).
 *
 * Everything here comes from NARRATIVE text, not tagged XBRL — Item 1A, Item 1C, Item 3, the
 * auditor's report, Item 9A. That is a different evidentiary class from the numbers on the
 * sector view, and the page says so rather than letting the two blur together.
 *
 * Every filer count is CLICK-TO-REVEAL: a number the reader cannot open is an assertion, and
 * the tickers behind it are the evidence.
 */
import { useState } from "react";
import { ChartCard, SectionHead, StatTile, StatTileRow, StatusChip, TickerChip } from "@ds";
import type { QualitativeSurface } from "../../data/surfaces";
import { fmt, plural } from "../../lib/format";
import { CoverageBar, FilerReveal, PctBar, PresenceMatrix } from "../../ui/primitives";
import { SeriesChart } from "../../charts/series";
import { useSelection } from "../../state";
import { navigate } from "../../router";

const DIRECTION_LABEL: Record<QualitativeSurface["themes"][number]["direction"], string> = {
  new: "new this year",
  rising: "rising",
  fading: "fading",
  stable: "stable",
};

export function QualitativeView({ surface }: { surface: QualitativeSurface }) {
  const sel = useSelection();
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const L = surface.landscape;

  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Risk-factor themes" />
        <p className="panel-note">
          Share of filers whose Item 1A carries each theme, against the same taxonomy as last
          year — the taxonomy is <b>frozen year over year</b>, because a re-cut taxonomy would
          manufacture movement that no filer actually wrote.
        </p>

        <div className="panel">
          <div className="rows">
            {surface.themes.map((t) => (
              <div key={t.id}>
                <div className="row">
                  <div className="row-main">
                    <button
                      type="button"
                      className="row-title linkish-plain"
                      onClick={() => setOpenTheme((o) => (o === t.id ? null : t.id))}
                      aria-expanded={openTheme === t.id}
                    >
                      {t.label}
                    </button>
                    <div className="row-sub">
                      {DIRECTION_LABEL[t.direction]} · {t.deltaPp > 0 ? "+" : ""}
                      {t.deltaPp}pp vs prior year
                    </div>
                  </div>
                  <div style={{ width: 190 }}>
                    <PctBar value={t.coverage * 100} right={`${Math.round(t.coverage * 100)}%`} />
                  </div>
                  <FilerReveal count={t.filers} tickers={t.tickers} />
                  <button
                    type="button"
                    className="linkish"
                    onClick={() =>
                      navigate(sel.href("/sectors/filings", {}) + `${sel.href("/sectors/filings").includes("?") ? "&" : "?"}risk=${t.id}`)
                    }
                  >
                    Filings →
                  </button>
                </div>

                {openTheme === t.id && (
                  <div className="metric-row-drawer">
                    <div className="quote">
                      “{t.excerpt}”
                      <span className="quote-src">{t.excerptSource}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() =>
                          navigate(
                            sel.href("/sectors/filings") +
                              `${sel.href("/sectors/filings").includes("?") ? "&" : "?"}risk=${t.id}`,
                          )
                        }
                      >
                        Open filings in ClearyFi →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Emerging this year</span>
              <span className="panel-hint">first appearance in Item 1A</span>
            </div>
            {surface.emerging.length ? (
              <div className="rows">
                {surface.emerging.map((e) => (
                  <div className="row" key={e.label}>
                    <span className="row-main">{e.label}</span>
                    <FilerReveal count={e.count} tickers={e.tickers} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">
                <StatusChip status="na" /> No theme crossed the "new" threshold this year. That is
                a finding, not an empty panel.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Going-concern watch</span>
              <span className="panel-hint">auditor report · substantial doubt</span>
            </div>
            {surface.goingConcern.count ? (
              <FilerReveal count={surface.goingConcern.count} tickers={surface.goingConcern.tickers} />
            ) : (
              <p className="panel-note">
                <StatusChip status="na" /> No filer in this peer set carries substantial-doubt
                language in the indexed window.
              </p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Material litigation</span>
            <span className="panel-hint">Item 3 — legal proceedings</span>
          </div>
          <FilerReveal count={surface.litigation.total} tickers={surface.litigation.tickers} />
          <div className="rows" style={{ marginTop: 8 }}>
            {surface.litigation.categories.map((c) => (
              <div className="row" key={c.label}>
                <span className="row-main">{c.label}</span>
                <FilerReveal count={c.count} tickers={c.tickers} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title="Per-filer signal matrix" />
        <div className="panel">
          <PresenceMatrix
            rows={surface.signals.slice(0, 16).map((s) => ({ key: s.symbol, label: `${s.symbol} · ${s.riskCount} risks` }))}
            cols={[
              { key: "new", label: "New risks" },
              { key: "gc", label: "Going concern" },
              { key: "lit", label: "Litigation" },
            ]}
            present={(rowKey, colKey) => {
              const s = surface.signals.find((x) => x.symbol === rowKey);
              if (!s) return null;
              if (colKey === "new") return s.newCount > 0;
              if (colKey === "gc") return s.goingConcern;
              return s.litigation;
            }}
          />
          <p className="panel-note" style={{ marginTop: 10 }}>
            Presence, not magnitude — a filled cell means the disclosure exists, and the count
            lives in the row label. Mapping counts to a color ramp here would invite reading
            "more risk factors" as "riskier", which Item 1A does not support.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHead n="03" title="Disclosure landscape" />

        <div className="grid-2">
          <ChartCard
            title="Cybersecurity"
            caption="Item 1C has been required since the 2023 rule, so near-total coverage is the baseline. A filer WITHOUT it is the signal."
          >
            <StatTileRow>
              <StatTile label="Disclosing Item 1C" value={String(L.cyber.disclosing)} note={`of ${surface.filers} filers`} />
              <StatTile label="8-K 1.05 incidents" value={String(L.cyber.incidents)} note="material incidents reported" />
            </StatTileRow>
            {L.cyber.incidents > 0 && (
              <div style={{ marginTop: 10 }}>
                <FilerReveal count={L.cyber.incidents} tickers={L.cyber.incidentTickers} noun="filers reporting" />
              </div>
            )}
          </ChartCard>

          <ChartCard title="Critical Audit Matters" caption="From the auditor's report (PCAOB AS 3101). Narrative, not a tagged fact.">
            <StatTile label="CAMs per filer" value={fmt(L.cams.avg, "ratio", 1)} note="mean across the peer set" />
            <div className="rows" style={{ marginTop: 8 }}>
              {L.cams.topics.map((t) => (
                <div className="row" key={t.label}>
                  <span className="row-main">{t.label}</span>
                  <span className="row-num">{t.count}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Auditor landscape</span>
            <span className="panel-hint">10-K auditor · 8-K 4.01 changes</span>
          </div>
          <div className="rows">
            {L.auditors.map((a) => (
              <div className="row" key={a.name}>
                <span className="row-main">{a.name}</span>
                <div style={{ width: 170 }}>
                  <PctBar value={a.filers} max={Math.max(...L.auditors.map((z) => z.filers))} right={`${a.filers}`} />
                </div>
                <span className="row-num">{a.avgTenure} yr tenure</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <FilerReveal count={L.auditorChanges.count} tickers={L.auditorChanges.tickers} noun="auditor changes" />
          </div>
        </div>

        <ChartCard
          title="Risk-factor volume"
          caption="Word count of Item 1A over time. Item 1A is an ANNUAL section — the interim quarters have nothing to count, so the line breaks rather than flattening to zero."
        >
          <SeriesChart
            series={[{ id: "rv", label: "Item 1A words", points: L.riskVolume, kind: "focal" }]}
            format={(v) => `${Math.round(v / 100) / 10}k`}
            height={190}
            label="Item 1A word count over eight quarters"
          />
          <p className="metric-row-caption">
            Net new risk factors year over year: <b>{L.netNewRisks > 0 ? `+${L.netNewRisks}` : L.netNewRisks}</b>
          </p>
        </ChartCard>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Non-GAAP & charges</span>
              <span className="panel-hint">8-K 2.02 / Ex-99.1 · MD&A</span>
            </div>
            <StatTileRow>
              <StatTile label="Filers using non-GAAP" value={String(L.nonGaap.usage)} note={`of ${surface.filers}`} />
              <StatTile label="Restructuring charges" value={String(L.nonGaap.chargeFilers)} note="filers with a charge this period" />
            </StatTileRow>
            <div style={{ marginTop: 10 }}>
              <FilerReveal count={L.nonGaap.chargeFilers} tickers={L.nonGaap.tickers} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Late & deficient filings</span>
              <span className="panel-hint">12b-25 · Item 9A · 8-K 4.02</span>
            </div>
            <div className="rows">
              <div className="row">
                <span className="row-main">Filed a 12b-25</span>
                <FilerReveal count={L.deficient.late} tickers={L.deficient.tickers} />
              </div>
              <div className="row">
                <span className="row-main">ICFR material weakness</span>
                <FilerReveal count={L.deficient.materialWeakness} tickers={L.deficient.tickers} />
              </div>
              <div className="row">
                <span className="row-main">Non-reliance (restatement)</span>
                <FilerReveal count={L.deficient.restatement} tickers={L.deficient.tickers} />
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Human capital & climate</span>
            <span className="panel-hint">Item 1 · voluntary climate disclosure</span>
          </div>
          <StatTileRow>
            <StatTile label="Disclosing headcount" value={String(L.humanCapital.disclosing)} note={`of ${surface.filers} filers`} />
            <StatTile
              label="Median headcount"
              value={L.humanCapital.median == null ? "N/A" : L.humanCapital.median.toLocaleString("en-US")}
              drained={L.humanCapital.median == null}
              note={L.humanCapital.median == null ? "too few filers state a figure" : "narrative, parsed from Item 1"}
            />
            <StatTile label="Climate / GHG disclosure" value={String(L.humanCapital.climate)} note="voluntary — the SEC rule is stayed" />
          </StatTileRow>
          <p className="panel-note" style={{ marginTop: 10 }}>
            Climate coverage will stay sparse while the SEC climate rule is stayed. A low number
            here measures the rule's status, not the sector's behavior.
          </p>
        </div>
      </section>
    </>
  );
}

export function QualitativeRail({ surface }: { surface: QualitativeSurface }) {
  return (
    <>
      <div className="panel-flat">
        <div className="panel-hint" style={{ marginBottom: 8 }}>
          Coverage
        </div>
        <CoverageBar pct={Math.round((surface.signals.length / Math.max(1, surface.filers)) * 100)} />
        <p className="panel-note" style={{ marginTop: 8 }}>
          {plural(surface.signals.length, "filer")} of {surface.filers} in the peer set have a
          parsed Item 1A in the indexed window.
        </p>
      </div>
      <div className="panel-flat">
        <div className="panel-hint" style={{ marginBottom: 8 }}>
          What this page is not
        </div>
        <p className="panel-note">
          Every figure on this page comes from <b>narrative text</b> — Item 1A, Item 1C, Item 3,
          the auditor's report — located by full-text search and counted. None of it is a tagged
          XBRL fact, so it carries parsing risk the numeric views do not.
        </p>
      </div>
      <div className="panel-flat">
        <div className="panel-hint" style={{ marginBottom: 8 }}>
          Filers in this peer set
        </div>
        <div className="tag-row">
          {surface.signals.slice(0, 18).map((s) => (
            <TickerChip key={s.symbol} symbol={s.symbol} />
          ))}
        </div>
      </div>
    </>
  );
}
