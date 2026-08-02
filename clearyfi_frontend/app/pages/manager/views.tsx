/**
 * The six manager views.
 *
 * A 13F filer described ONLY by its own filings. No market values anywhere — 13F dollar columns
 * are market-priced, so composition is expressed in positions and in each issuer's shares
 * outstanding. Two of these views exist mainly to say what the filings cannot tell you, which
 * is the point rather than a caveat.
 */
import {
  ChartCard,
  CompositionStrip,
  SectionHead,
  StatTile,
  StatTileRow,
  StatusChip,
  TickerChip,
} from "@ds";
import type {
  ManagerActivitySurface,
  ManagerBehaviourSurface,
  ManagerFivePercentSurface,
  ManagerFootprintSurface,
  ManagerSurface,
  ManagerVotingSurface,
} from "../../data/surfaces";
import { compact, humanDate, plural } from "../../lib/format";
import { PctBar, StackedBar } from "../../ui/primitives";
import { Treemap } from "../../charts/misc";
import { CohortHeatmap } from "../../charts/misc";
import { DumbbellChart, Histogram, ParetoChart } from "../../charts/bars";
import { StepChart } from "../../charts/series";
import { WindowStrip } from "../../charts/strips";
import { useSelection } from "../../state";
import { navigate } from "../../router";

// ---------------------------------------------------------------------------- profile

export function ProfileView({ surface }: { surface: ManagerSurface }) {
  const sel = useSelection();
  return (
    <>
      <section className="section">
        <SectionHead n="01" title="What was filed" />
        <StatTileRow>
          <StatTile label="Reported positions" value={String(surface.positions)} note={`13F-HR for ${surface.period}`} />
          <StatTile label="Issuers held" value={String(surface.issuers)} note="in the illustrative universe" />
          <StatTile label="New positions" value={String(surface.newPositions)} note="DERIVED by diffing quarters" />
          <StatTile label="Exited" value={String(surface.exited)} note="DERIVED by diffing quarters" />
          <StatTile label="Portfolio value" value="N/A" drained note="13F dollar columns are market-priced — out of scope" />
        </StatTileRow>
        <p className="panel-note">
          New and exited counts are <b>derived by diffing two quarter-end snapshots</b>. They are
          not reported trades: a position opened and closed inside one quarter never appears, and
          a position shown as "new" may have been bought on any day of the quarter.
        </p>
      </section>

      <section className="section">
        <SectionHead n="02" title="Largest reported positions" />
        <div className="panel">
          <div className="rows">
            {surface.topHoldings.map((h) => (
              <div className="row" key={h.symbol}>
                <TickerChip symbol={h.symbol} />
                <button
                  type="button"
                  className="row-main linkish-plain"
                  onClick={() => navigate(sel.href(`/company/${h.symbol}`, { focal: h.symbol }))}
                >
                  <span className="row-title">{h.name}</span>
                  <div className="row-sub">{h.pctOut}% of shares outstanding</div>
                </button>
                <div style={{ width: 150 }}>
                  <PctBar value={h.shares} max={surface.topHoldings[0].shares} right={compact(h.shares)} />
                </div>
              </div>
            ))}
          </div>
          <p className="panel-note" style={{ marginTop: 10 }}>
            Sized by <b>shares</b>, and expressed against each issuer's shares outstanding —
            the only size measure available without market data.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHead n="03" title="Concentration" />
        <ChartCard title="Share of reported shares by issuer band" caption="Bands are parts of one whole, so they share a single-hue ramp.">
          <CompositionStrip segments={surface.concentration.map((c) => ({ label: c.label, share: c.share }))} />
        </ChartCard>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- footprint

export function FootprintView({ surface }: { surface: ManagerFootprintSurface }) {
  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Register footprint" />
        <ChartCard
          title="Reported positions by issuer"
          caption="Cell area is proportional to shares held, not to value. A squarified treemap keeps cells close to square so areas stay comparable by eye."
        >
          <Treemap leaves={surface.leaves} format={(v) => `${compact(v)} shares`} height={320} label="Register footprint" />
        </ChartCard>
      </section>

      <section className="section">
        <SectionHead n="02" title="Where the register is concentrated" />
        <ChartCard
          title="Ranked issuers with cumulative share"
          caption="Bars take one fill with the leader emphasized — a per-bar palette would imply the issuers are unrelated categories. The dashed line is the prior quarter's cumulative curve."
        >
          <ParetoChart rows={surface.pareto} format={(v) => compact(v)} height={260} label="Issuer concentration" />
        </ChartCard>
      </section>

      <section className="section">
        <SectionHead n="03" title="By sector" />
        <ChartCard title="Positions per sector" caption="Position COUNT, not weight — weighting by size would require prices this product does not carry.">
          <StackedBar parts={surface.bySector.map((s) => ({ key: s.key, label: s.label, share: s.positions }))} />
        </ChartCard>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- voting

export function VotingView({ surface }: { surface: ManagerVotingSurface }) {
  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Voting record" />
        <p className="panel-note">
          From <b>N-PX</b>, filed annually for the year ended 30 June. A vote cast in August
          surfaces more than a year later, so this is a record, not a current position.
        </p>
        <div className="panel">
          <div className="rows">
            {surface.summary.map((s) => (
              <div className="row" key={s.category}>
                <span className="row-main">{s.category}</span>
                <div style={{ width: 170 }}>
                  <PctBar
                    value={s.total ? (s.withMgmt / s.total) * 100 : 0}
                    right={`${s.total ? Math.round((s.withMgmt / s.total) * 100) : 0}% with mgmt`}
                  />
                </div>
                <span className="row-num">{plural(s.total, "vote")}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title="Every reported vote" />
        <div className="panel">
          <div className="rows">
            {surface.proposals.map((p) => (
              <div className="row" key={p.id}>
                <TickerChip symbol={p.issuer} />
                <span className="row-main">
                  <span className="row-title">{p.proposal}</span>
                  <div className="row-sub">{p.category}</div>
                </span>
                <span className="form-badge">{p.vote}</span>
                <span className="row-num">{p.withMgmt ? "with mgmt" : "against mgmt"}</span>
              </div>
            ))}
          </div>
          <p className="panel-note" style={{ marginTop: 10 }}>
            <StatusChip status="na" /> N-PX records how a manager voted, never why. A vote
            against management is not evidence of a thesis about the company.
          </p>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- 5% filings

export function FivePercentView({ surface }: { surface: ManagerFivePercentSurface }) {
  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Stakes crossing 5%" />
        <ChartCard
          title="Reported beneficial ownership over time"
          caption="Step lines: a stake changes on a filing date, not smoothly between them. Series names sit in a legend because every line ends just above 5% and end-of-line labels always collide."
        >
          <StepChart
            series={surface.stakes.map((s) => ({ id: s.name, label: s.name, points: s.points }))}
            threshold={5}
            height={250}
            label="Beneficial ownership over time"
          />
        </ChartCard>
        <p className="panel-note">
          The 5% line is the reporting threshold. Below it there is no filing obligation at all,
          so a gap in these lines is an <b>absence of obligation</b>, not an absence of position.
        </p>
      </section>

      <section className="section">
        <SectionHead n="02" title="Filings on record" />
        <div className="panel">
          <div className="rows">
            {surface.filings.map((f) => (
              <div className="row" key={f.id}>
                <TickerChip symbol={f.issuer} />
                <span className="form-badge">{f.form}</span>
                <span className="row-main">
                  <span className="row-title">{f.pct}% of the class</span>
                  <div className="row-sub">passive holder — Schedule 13G</div>
                </span>
                <span className="row-num">{humanDate(f.filed)}</span>
              </div>
            ))}
          </div>
          <p className="panel-note" style={{ marginTop: 10 }}>
            An amendment is only required on a <b>material</b> change. Silence between filings is
            not evidence that nothing changed.
          </p>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- activity

export function ActivityView({ surface }: { surface: ManagerActivitySurface }) {
  return (
    <>
      <section className="section">
        <SectionHead n="01" title="How old is this?" />
        {/* The age of the newest fact is shown as prominently as the fact itself. */}
        <div className="provisional-note">
          <StatusChip status="approximate" />
          <span>
            The newest thing on file for this manager is the <b>{surface.newestFact.label}</b>,
            accepted {humanDate(surface.newestFact.date)} — <b>{surface.newestFact.ageDays} days
            ago</b>. Everything on every manager view is at least that old.
          </span>
        </div>

        <div className="clocks">
          {surface.clocks.map((c) => (
            <div className="clock" key={c.label}>
              <div className="clock-label">{c.label}</div>
              <div className="clock-value">{c.value}</div>
              <div className="clock-note">{c.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title="Against the statutory window" />
        <ChartCard
          title="13F filing window"
          caption="Day 0 is the quarter end; day 45 is the statutory deadline. A lag figure without its deadline is not interpretable, which is why this is a window rather than a number."
        >
          <WindowStrip statutory={surface.window.statutory} filings={surface.window.filings} />
        </ChartCard>
      </section>

      <section className="section">
        <SectionHead n="03" title="Staleness ledger" />
        <p className="panel-note">
          Per form: how old it is, what it tells you, and <b>what it cannot</b>. The last column
          is the load-bearing one.
        </p>
        <div className="panel">
          <div className="ledger">
            {surface.ledger.map((l) => (
              <div className="ledger-row" key={l.form}>
                <div>
                  <div className="ledger-form">{l.form}</div>
                  <div className="ledger-asof">
                    {l.asOf === "—" ? "nothing on file" : `as of ${humanDate(l.asOf)}`}
                  </div>
                  {l.asOf !== "—" && (
                    <div style={{ marginTop: 6 }}>
                      <PctBar value={Math.min(100, (l.ageDays / 400) * 100)} right={`${l.ageDays}d`} />
                    </div>
                  )}
                </div>
                <div>
                  <div className="ledger-tells">{l.tells}</div>
                  <div className="ledger-cannot">{l.cannot}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- behaviour

export function BehaviourView({ surface }: { surface: ManagerBehaviourSurface }) {
  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Filing cadence" />
        <ChartCard
          title="Days from quarter end to acceptance"
          caption="Eight quarters of this manager's own filing behaviour. The median label prints the real median, not the bin it falls in."
        >
          <Histogram
            values={surface.cadence}
            median={surface.cadenceMedian}
            format={(v) => `${Math.round(v)}d`}
            height={200}
            label="Filing cadence"
          />
        </ChartCard>
        <StatTileRow>
          <StatTile label="Median lag" value={`${Math.round(surface.cadenceMedian)} d`} note="against a 45-day deadline" />
          <StatTile label="Amendment rate" value={`${surface.amendmentRate}%`} note="13F-HR/A as a share of filings" />
        </StatTileRow>
      </section>

      <section className="section">
        <SectionHead n="02" title="Position changes" />
        <ChartCard
          title="Prior quarter → current, by issuer"
          caption="Hollow = prior, filled = current. DERIVED by diffing snapshots — never a reported trade."
        >
          <DumbbellChart rows={surface.dumbbell} format={(v) => compact(v)} label="Position changes" />
        </ChartCard>
      </section>

      <section className="section">
        <SectionHead n="03" title="Holding period" />
        <ChartCard
          title="How long positions stay in the register"
          caption="Single-hue sequential — this is one magnitude, not a category scale. A hatched cell is a quarter with no filing, not a zero."
        >
          <CohortHeatmap
            rows={surface.cohort.rows}
            cols={surface.cohort.cols}
            cells={surface.cohort.cells}
            format={(v) => plural(v, "position")}
            label="Holding period cohorts"
          />
        </ChartCard>
      </section>
    </>
  );
}
