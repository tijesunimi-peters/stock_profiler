/**
 * Company Hub → Peer-relative ("beyond the financials").
 *
 * The distribution strip is a CONTROL, not a picture: clicking a peer dot changes the focal
 * company and every surface on the page recomputes. That is the interaction the whole
 * peer-comparison vocabulary is built around.
 */
import { useState } from "react";
import { ChartCard, SectionHead, StatTile, StatTileRow } from "@ds";
import type { CompanyPeersSurface } from "../../data/surfaces";
import { fmt, pctile } from "../../lib/format";
import { percentileOf } from "../../lib/seed";
import { PeerStrip } from "../../charts/strips";
import { SeriesChart, Sparkline } from "../../charts/series";
import { ScatterPlot } from "../../charts/misc";
import { useSelection } from "../../state";
import { navigate } from "../../router";

export function PeersView({ surface }: { surface: CompanyPeersSurface }) {
  const sel = useSelection();
  const [open, setOpen] = useState<string | null>(null);
  const B = surface.beyond;

  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Against the peer set" />
        <p className="panel-note">
          Every dot is a filer in {surface.sector.short}. <b>Click one to make it the focal
          company</b> — the rail, the rank and every strip below recompute. The focal filer is a
          diamond: shape and size distinguish it, never a unique color.
        </p>

        <div className="panel">
          <div className="metric-rows">
            {surface.rows.map((row) => {
              const mine = row.peers.find((p) => p.symbol === surface.focal);
              const others = row.peers.map((p) => p.value).filter((v): v is number => v != null);
              const pct =
                mine?.value != null && others.length > 1
                  ? row.favorability === "lower"
                    ? 100 - percentileOf(mine.value, others)
                    : percentileOf(mine.value, others)
                  : null;
              return (
                <div className="metric-row" key={row.key}>
                  <div className="metric-row-head">
                    <span className="metric-row-name">{row.label}</span>
                    <span className="metric-row-median">
                      {surface.focal} {mine?.value == null ? "N/A" : fmt(mine.value, row.unit as never)} ·
                      median {row.medianDisplay}
                    </span>
                    {row.favorability === "lower" && <span className="pairbars-inverted">lower is better</span>}
                    <span className="metric-row-spacer" />
                    {pct != null && <span className="rankbadge">{pctile(pct)} in peer set</span>}
                    <button
                      type="button"
                      className="spark-btn"
                      onClick={() => setOpen((k) => (k === row.key ? null : row.key))}
                      aria-expanded={open === row.key}
                      title="Open the eight-quarter trend"
                    >
                      <Sparkline points={row.history} />
                    </button>
                  </div>

                  <PeerStrip
                    peers={row.peers.map((p) => ({ id: p.symbol, label: p.name, value: p.value }))}
                    marks={
                      mine?.value != null
                        ? [{ id: surface.focal, label: surface.focal, value: mine.value, kind: "focal" }]
                        : []
                    }
                    format={(v) => fmt(v, row.unit as never)}
                    onPick={(symbol) =>
                      navigate(sel.href(`/company/${symbol}/peers`, { focal: symbol }))
                    }
                    height={64}
                    label={`${row.label} across the peer set`}
                  />
                  <p className="metric-row-caption">
                    {row.caption}
                    {mine?.value == null &&
                      ` · ${surface.focal} is excluded from this comparison — it does not tag ${row.label.toLowerCase()} for this period.`}
                  </p>

                  {open === row.key && (
                    <div className="metric-row-drawer">
                      <SeriesChart
                        series={[{ id: row.key, label: `${surface.sector.short} median`, points: row.history, kind: "focal" }]}
                        format={(v) => fmt(v, row.unit as never)}
                        area
                        height={190}
                        label={`${row.label} — eight quarters`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title="Two metrics at once" />
        <ChartCard
          title="R&D intensity vs operating margin"
          caption="Each dot is a peer; the focal filer is enlarged. Labels are placed by trying candidate offsets and are DROPPED when none clears its neighbours — the value stays on the hover readout rather than overlapping."
        >
          <ScatterPlot
            points={surface.scatter}
            xLabel="R&D intensity %"
            yLabel="Operating margin %"
            height={300}
            label="R&D intensity against operating margin"
          />
        </ChartCard>
      </section>

      <section className="section">
        <SectionHead n="03" title="Beyond the financials" />
        <p className="panel-note">
          Things a peer set reveals that a statement does not — all of it from filing metadata,
          narrative sections and the auditor's report rather than tagged facts.
        </p>
        <StatTileRow>
          <StatTile label="EDGAR acceptance lag" value={`${B.acceptanceLagDays} d`} note="filing date → acceptance timestamp" />
          <StatTile label="Extension tags" value={`${B.extensionTagShare}%`} note="of tagged facts are the filer's own elements" />
          <StatTile label="Risk factors" value={String(B.riskFactorCount)} note="Item 1A, counted" />
          <StatTile label="Critical Audit Matters" value={String(B.camCount)} note="auditor's report" />
          <StatTile label="Auditor" value={B.auditor} note={`${B.auditorTenure} years tenure`} />
          <StatTile label="Subsidiaries" value={String(B.subsidiaries)} note="Exhibit 21" />
          <StatTile label="Reported segments" value={String(B.segmentCount)} note="ASC 280" />
          <StatTile label="Late filings" value={String(B.lateFilings)} note="Form 12b-25 in the window" />
          <StatTile label="Board & officer changes" value={String(B.boardChanges)} note="8-K Item 5.02" />
        </StatTileRow>
        <p className="panel-note">
          A high extension-tag share is not a fault — it means this filer describes itself with
          its own elements, which makes it <b>less comparable</b> to its peers, not worse. That
          distinction is why the number is shown rather than folded into a score.
        </p>
      </section>
    </>
  );
}
