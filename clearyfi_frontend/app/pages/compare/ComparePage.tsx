/**
 * `/compare/sectors` and `/compare/companies`, ported from the prototype's ALTITUDE 3 and its
 * COMPARE COMPANIES block.
 *
 * The prototype used one word, "Compare", for two different comparisons. They are split here so
 * a route says which one it is (RECONCILIATION §2).
 *
 * No winner is declared on either surface. Bars are true-length; an inverted metric gets a text
 * marker rather than a flipped fill; A/B colour is categorical identity, not a verdict.
 *
 * The company surface leads with what has to LINE UP before two filers can be compared — fiscal
 * year ends, statement basis, segment structure, and which measures both filers even tag. A
 * measure absent from one filer's statements is omitted, never drawn as zero: a bank has no
 * gross margin, and printing 0% would be a claim about the business rather than a gap.
 */
import { useState, type ReactNode } from "react";
import { EntityBar, STANDARD_DISCLOSURES } from "@ds";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { MiniPairs, PairBars } from "../../ui/primitives";
import { LogDots, RadarChart, ScatterPlot } from "../../charts/misc";
import { PeerStrip } from "../../charts/strips";
import { StackedColumns, stackRamp } from "../../charts/bars";
import { SECTOR_ABBR, SECTOR_NAMES, BASE_PEER_COUNT, SUB_COUNTS } from "../../data/prototype";
import { useSectorRoster } from "../../lib/useSectorRoster";
import { SectorControlBar } from "../../ui/SectorControlBar";
import { SectorRail } from "../sectors/SectorView";
import { HubRail } from "../company/HubOverview";
import { useScrollSpy } from "../../lib/useApi";
import {
  CC_SECTIONS, UNIVERSE, companyCompare, sectorCompare, money,
  type PairRow, type StackedPair,
} from "../../data/compare";

/**
 * The prototype puts compare under whichever SUBJECT you are comparing within — sector-vs-sector
 * belongs to Sectors, company-vs-company to Companies (COMPANY_VIEWS includes 'ccompare'). So
 * each surface wears its parent subject's chrome: its title, its view rail, its right rail and
 * its content width. Neither rail entry is active, because compare is not one of the views —
 * it is an action, and the sidebar highlights it there.
 */
const SECTOR_VIEWS = [
  { value: "sector", label: "Sector" },
  { value: "qualitative", label: "Qualitative" },
];

const COMPANY_VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "history", label: "Financial history" },
  { value: "institutional", label: "Institutional" },
  { value: "insider", label: "Insider activity" },
  { value: "peers", label: "Peer-relative" },
];

export function ComparePage({ view }: { view: "sectors" | "companies" }) {
  return view === "companies" ? <CompanyComparePage /> : <SectorComparePage />;
}

function SectorComparePage() {
  const sel = useSelection();
  /*
   * The SHELL is real and the PANELS below are not, and that split is the honest state of this
   * surface today. The control bar and the header name the SIC group the reader actually selected
   * (`/v1/sectors`); the comparison panels still run on the prototype's eleven invented sectors and
   * their own A/B pills. `PROVENANCE.syntheticSurfaces` still lists "compare", which is what makes
   * the mixture legible rather than silent — and porting these panels is the next slice.
   */
  const { label } = useSectorRoster();
  return (
    <PageShell
      subject="sectors"
      activeAction="Compare"
      title="Sector analytics"
      subtitle="Built entirely from SEC-filed data · as of latest filing, not real-time"
      right={`${sel.sectorGroup} · ${label(sel.sectorGroup)}`}
      controlBar={<SectorControlBar />}
      views={SECTOR_VIEWS}
      activeView=""
      onView={(v) => navigate(sel.href(`/sectors/${v}`))}
      railNote="Sector · period · company preserved across views (§7). Selecting a sector keeps your current metric focus."
      railWidth={132}
      contentMax={960}
      rightRail={<SectorRail />}
      disclosures={[
        STANDARD_DISCLOSURES.financials_floor,
        "No row on this page declares a winner. A/B colour is categorical identity only.",
        "Composite theme scores are provisional: the rollup method is a placeholder and the weighting is an open decision.",
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      <SectorCompare />
    </PageShell>
  );
}

function CompanyComparePage() {
  const sel = useSelection();
  const d = companyCompare(sel.compareX, sel.compareY);
  const activeSection = useScrollSpy(CC_SECTIONS.map((s) => s.href.slice(1)));
  return (
    <PageShell
      subject="company"
      activeAction="Compare"
      title="Company hub"
      subtitle="Everything filed by this registrant · 10-K, 10-Q, 8-K, Forms 3/4/5 · as of latest filing"
      right={`${d.aTicker} vs ${d.bTicker}`}
      controlBar={
        <EntityBar
          cells={[
            { label: "Company A", value: d.aName, primary: true, swatch: "var(--accent)" },
            { label: "Sector", value: d.aSector },
            { label: "Company B", value: d.bName, primary: true, swatch: "var(--gaap-color)" },
            { label: "Sector", value: d.bSector },
          ]}
          note={d.crossLabel}
        />
      }
      views={COMPANY_VIEWS}
      activeView=""
      onView={(v) => navigate(sel.href(`/company/${d.aTicker}/${v}`, { focal: d.aTicker }))}
      railNote="Sector · period · company preserved across views (§7). Selecting a sector keeps your current metric focus."
      sections={CC_SECTIONS.map((s) => ({ ...s, current: s.href.slice(1) === activeSection }))}
      railWidth={178}
      contentMax={1320}
      rightRail={<HubRail />}
      disclosures={[
        STANDARD_DISCLOSURES.financials_floor,
        "No row on this page declares a winner. A/B colour is categorical identity only.",
        "Nothing here restates either filer onto the other's calendar or accounting basis. Where a basis item differs, the two columns are separate measurements shown next to each other.",
        "A measure absent from one filer's statements is omitted rather than shown as zero.",
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      <CompanyCompare />
    </PageShell>
  );
}

/** The A/B key both surfaces open with. */
function AbKey({ a, b, note }: { a: string; b: string; note: string }) {
  return (
    <div className="cmp-key">
      <span>
        <i className="cmp-swatch is-a" />
        {a}
      </span>
      <span>
        <i className="cmp-swatch is-b" />
        {b}
      </span>
      <span>{note}</span>
    </div>
  );
}

/**
 * Two 100%-of-itself columns, with the legend and note beside them.
 *
 * The chart's own legend is switched off and redrawn in the DOM from `stackRamp`, the same ramp
 * the chart fills its bands with — so the swatches match the bars, and the note can sit in the
 * side column where the prototype puts it.
 */
function Stacked({
  d, label, note, expand,
}: {
  d: StackedPair;
  label: string;
  note?: string;
  expand?: () => void;
}) {
  const ramp = stackRamp(d.segs.length);
  return (
    <>
      {expand && <Expand onClick={expand} />}
      <div className="cmp-split">
        <div className="cmp-split-chart">
          <StackedColumns
            columns={d.columns.map((c) => ({
              key: c.name,
              label: `${c.name} · ${c.sub}`,
              parts: c.vals.map((v, i) => ({ key: d.segs[i].label, label: d.segs[i].label, value: v })),
            }))}
            format={(v) => `${v.toFixed(0)}%`}
            legend={false}
            height={260}
            label={label}
          />
        </div>
        <div className="cmp-split-side">
          <div className="cmp-legend-col">
            {d.segs.map((seg, i) => (
              <span key={seg.label}>
                <i style={{ background: ramp[i] }} />
                {seg.label}
              </span>
            ))}
          </div>
          {note && <div className="hub-note">{note}</div>}
        </div>
      </div>
    </>
  );
}

/** The prototype's expand affordance — opens the chart at overlay width. */
function Expand({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="cmp-expand" onClick={onClick} title="Open larger">
      ⤡ Expand
    </button>
  );
}

/** Pair rows where a missing side is an ABSENCE, passed as null so it renders as N/A. */
const toPairRows = (rows: PairRow[]) =>
  rows.map((r) => ({
    key: r.k,
    label: r.k,
    a: r.aMissing ? null : r.a,
    b: r.bMissing ? null : r.b,
    display: r.fmt,
    aReason: r.aMissing ? "this filer reports no such line" : undefined,
    bReason: r.bMissing ? "this filer reports no such line" : undefined,
  }));

// ============================================================ sector vs sector

function SectorCompare() {
  const sel = useSelection();
  const ai = sel.compareA;
  const bi = sel.compareB;
  const peerCount = sel.subIdx >= 0 ? SUB_COUNTS[sel.subIdx] : BASE_PEER_COUNT;
  const d = sectorCompare(ai, bi, peerCount);

  const pills = (side: "a" | "b", current: number) =>
    SECTOR_NAMES.map((n, i) => (
      <button
        key={n}
        type="button"
        className={`cmp-pill is-${side}${i === current ? " is-active" : ""}`}
        onClick={() => sel.set(side === "a" ? { compareA: i } : { compareB: i })}
      >
        {SECTOR_ABBR[i]}
      </button>
    ));

  return (
    <div className="cmp">
      <div className="cmp-masthead">
        <span className="cmp-side">
          <i className="cmp-swatch is-a" />
          <span className="cmp-name">{d.aName}</span>
        </span>
        <span className="cmp-vs">vs</span>
        <span className="cmp-side">
          <i className="cmp-swatch is-b" />
          <span className="cmp-name">{d.bName}</span>
        </span>
        <span className="cmp-spacer" />
        <span className="cmp-counts">{d.counts}</span>
      </div>

      <div className="cmp-pills">
        <span className="cmp-pills-label is-a">Sector A</span>
        {pills("a", ai)}
      </div>
      <div className="cmp-pills">
        <span className="cmp-pills-label is-b">Sector B</span>
        {pills("b", bi)}
      </div>

      <div className="p-card cmp-scores">
        <div className="hub-label">Composite scores · shared 0–100 scale</div>
        {d.rows.map((r) => {
          const max = Math.max(r.a, r.b) || 1;
          return (
            <div className="cmp-score-row" key={r.name}>
              <span className="cmp-score-name">{r.name}</span>
              <span className="cmp-score-bars">
                <span className="cmp-score-bar">
                  <span className="is-a" style={{ width: `${(r.a / max) * 100}%` }} />
                  <span className="cmp-score-v">{r.a}</span>
                </span>
                <span className="cmp-score-bar">
                  <span className="is-b" style={{ width: `${(r.b / max) * 100}%` }} />
                  <span className="cmp-score-v">{r.b}</span>
                </span>
              </span>
              <span className={`cmp-gap${r.strong ? " is-strong" : ""}`}>{r.gapLabel}</span>
            </div>
          );
        })}
      </div>

      <div className="p-card cmp-radar">
        <div>
          <div className="hub-panel-head">
            <span className="hub-panel-title">Composite profile</span>
            <span className="hub-hint">shape across 7 themes</span>
          </div>
          <RadarChart
            axes={d.radarAxes}
            series={[
              { id: "a", label: d.aName, values: d.radarA, kind: "a" },
              { id: "b", label: d.bName, values: d.radarB, kind: "b" },
            ]}
            height={300}
            label="Composite profile across seven themes"
          />
        </div>
        <div className="cmp-radar-note">
          <div className="hub-label">Reading the shape</div>
          The polygons trace each sector&apos;s 7 composite scores (per-theme gaps are in the table
          above). Where the two shapes pull apart, the sectors are structurally unlike; where they
          overlap, they behave similarly. Neither larger area means &ldquo;better&rdquo; — this is
          profile, not rank.
        </div>
      </div>

      <div className="cmp-head">
        <span className="cmp-head-title">Metric medians &amp; spread</span>
        <span className="hub-hint">
          bar length normalized per metric · band = IQR · tick = median
        </span>
      </div>
      <div className="cmp-cards">
        {d.cards.map((m) => (
          <div className="cmp-card" key={m.name}>
            <div className="cmp-card-head">
              <span className="cmp-card-name">{m.name}</span>
              {m.inverted && <span className="px-dirtag">lower is better</span>}
            </div>
            <div className="cmp-card-bars">
              {(
                [
                  ["a", m.a, m.aLabel] as const,
                  ["b", m.b, m.bLabel] as const,
                ]
              ).map(([side, v, lab]) => {
                const max = Math.max(m.a, m.b) || 1;
                return (
                  <div className="cmp-card-bar" key={side}>
                    <span className="cmp-card-track">
                      <span className={`is-${side}`} style={{ width: `${Math.round((v / max) * 100)}%` }} />
                    </span>
                    <span className={`cmp-card-v is-${side}`}>{lab}</span>
                  </div>
                );
              })}
            </div>
            {/*
              Two rails on ONE shared scale spanning q1→q3 across both sectors — band is the IQR,
              tick the median. No axis: the two end labels carry the scale, and a full axis at
              this size collides with the rails.
            */}
            <div className="cmp-spread">
              {(
                [
                  ["a", m.spreadA] as const,
                  ["b", m.spreadB] as const,
                ]
              ).map(([side, sp]) => {
                const lo = Math.min(m.spreadA.q1, m.spreadB.q1);
                const hi = Math.max(m.spreadA.q3, m.spreadB.q3);
                const rng = hi - lo || 1;
                const pos = (v: number) => ((v - lo) / rng) * 100;
                return (
                  <div className="cmp-spread-row" key={side}>
                    <span className={`cmp-spread-k is-${side}`}>{side.toUpperCase()}</span>
                    <span className="cmp-spread-rail">
                      <span className="cmp-spread-line" />
                      <span
                        className={`cmp-spread-band is-${side}`}
                        style={{ left: `${pos(sp.q1)}%`, width: `${pos(sp.q3) - pos(sp.q1)}%` }}
                      />
                      <span
                        className={`cmp-spread-tick is-${side}`}
                        style={{ left: `calc(${pos(sp.med)}% - 1px)` }}
                      />
                    </span>
                  </div>
                );
              })}
              <div className="cmp-spread-scale">
                <span>{m.fmt(Math.min(m.spreadA.q1, m.spreadB.q1))}</span>
                <span>{m.fmt(Math.max(m.spreadA.q3, m.spreadB.q3))}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hub-note">
        Bars are true-length; no winner is chosen (§9.2). Inverted metrics carry a &ldquo;lower is
        better&rdquo; marker rather than a flipped fill. A vs B colour is categorical identity only
        — not a verdict.
      </div>
    </div>
  );
}

// ============================================================ company vs company

/** Every chart the prototype lets you open at overlay width, with its own title and subtitle. */
const ZOOMS: Record<string, { title: string; sub: string }> = {
  ccstruct: { title: "Cost structure", sub: "each column is 100% of that filer’s own revenue" },
  cclog: { title: "Reported figures, as filed", sub: "logarithmic axis — each gridline is ten times the last" },
  ccemp: { title: "Employees", sub: "10-K human-capital disclosure" },
  ccmix: { title: "Revenue composition", sub: "ASC 606 disaggregation, as each filer discloses it" },
  cctiming: { title: "Timing of revenue recognition", sub: "over time against at a point in time" },
  ccgeo: { title: "Geographic mix", sub: "10-K geographic footnote" },
  ccconc: { title: "Customer concentration", sub: "the tick is the 10% disclosure threshold" },
  ccintensity: { title: "Capital intensity and operating shape", sub: "one axis per metric — units differ" },
  ccscatter: { title: "Managers holding both", sub: "share of shares outstanding on each side" },
};

function CompanyCompare() {
  const sel = useSelection();
  const d = companyCompare(sel.compareX, sel.compareY);
  const [zoom, setZoom] = useState<string | null>(null);
  const z = (k: string) => () => setZoom(k);

  const picker = (side: "a" | "b", curTicker: string, curSec: number) => (
    <div className="cmp-picker">
      <div className={`hub-label no-mb is-${side}`}>Company {side.toUpperCase()}</div>
      <div className="cmp-picker-row">
        {SECTOR_NAMES.map((n, i) => (
          <button
            key={n}
            type="button"
            title={n}
            className={`cmp-pill is-sm is-${side}${i === curSec ? " is-active" : ""}`}
            onClick={() => {
              const first = UNIVERSE.find((c) => c.sec === i);
              if (first) sel.set(side === "a" ? { compareX: first.ticker } : { compareY: first.ticker });
            }}
          >
            {SECTOR_ABBR[i]}
          </button>
        ))}
      </div>
      <div className="cmp-picker-row">
        {UNIVERSE.filter((c) => c.sec === curSec).map((c) => (
          <button
            key={c.ticker}
            type="button"
            title={c.name}
            className={`cmp-pill is-${side}${c.ticker === curTicker ? " is-active" : ""}`}
            onClick={() => sel.set(side === "a" ? { compareX: c.ticker } : { compareY: c.ticker })}
          >
            {c.ticker}
          </button>
        ))}
      </div>
    </div>
  );

  const aSec = UNIVERSE.find((c) => c.ticker === d.aTicker)?.sec ?? 0;
  const bSec = UNIVERSE.find((c) => c.ticker === d.bTicker)?.sec ?? 0;

  return (
    <div className="cmp">
      <div className="cmp-masthead">
        <span className="cmp-side">
          <i className="cmp-swatch is-a" />
          <span className="cmp-name">{d.aName}</span>
          <span className="hub-hint">{d.aSector}</span>
        </span>
        <span className="cmp-vs">vs</span>
        <span className="cmp-side">
          <i className="cmp-swatch is-b" />
          <span className="cmp-name">{d.bName}</span>
          <span className="hub-hint">{d.bSector}</span>
        </span>
        <span className="cmp-spacer" />
        <span className="cmp-cross">{d.crossLabel}</span>
      </div>

      <div className="cmp-pickers">
        {picker("a", d.aTicker, aSec)}
        {picker("b", d.bTicker, bSec)}
      </div>

      {/* The basis line comes FIRST, before any figure. */}
      <div className="cmp-basis-bar">
        <span className="hub-label no-mb">Basis</span>
        <span className="cmp-basis-text">
          {d.readFirst} — the full basis and comparability detail is in sections 06 and 07.
        </span>
      </div>

      <AbKey a={d.aTicker} b={d.bTicker} note="categorical identity only — no row declares a winner" />

      <Section n="01" title="Financial metrics" src="cost structure and the ratios that scale with revenue" id="c1">
        <Stacked d={d.struct} label="Cost structure" note={d.structNote} expand={z("ccstruct")} />
        <div className="cmp-sub">Cash, capital and balance-sheet ratios</div>
        <PairBars rows={toPairRows(d.csRest)} aLabel={d.aTicker} bLabel={d.bTicker} />
        <div className="hub-note">{d.csNote}</div>
      </Section>

      <Section n="02" title="Reported figures, as filed" src="logarithmic axis — two filers of very different size stay legible" id="c2">
        <Expand onClick={z("cclog")} />
        <LogDots rows={d.repMoney} aLabel={d.aTicker} bLabel={d.bTicker} format={money} label="Reported figures on a log axis" />
        <div className="cmp-sub">Headcount · 10-K human-capital disclosure</div>
        <Expand onClick={z("ccemp")} />
        <LogDots rows={d.repEmp} aLabel={d.aTicker} bLabel={d.bTicker} format={(v) => Math.round(v).toLocaleString()} label="Employees" />
        <div className="hub-note">
          {d.repNote} Position on the axis is the order of magnitude; the ratio at the right of each
          row states the relationship exactly.
        </div>
      </Section>

      <Section n="03" title="Business model" src="how each filer says it earns, and from whom" id="c3">
        <div className="cmp-sub">Revenue composition · ASC 606 disaggregation</div>
        <Stacked d={d.revMix} label="Revenue composition" expand={z("ccmix")} />
        <div className="cmp-sub">Timing of revenue recognition</div>
        <Stacked d={d.timing} label="Timing of revenue recognition" expand={z("cctiming")} />
        <div className="cmp-sub">Customer concentration</div>
        <Expand onClick={z("ccconc")} />
        <MiniPairs panels={toPairRows(d.conc)} aLabel={d.aTicker} bLabel={d.bTicker} />
        <div className="hub-note">{d.concNote}</div>
        <div className="cmp-sub">Geographic mix · 10-K geographic footnote</div>
        <Stacked d={d.geo} label="Geographic mix" expand={z("ccgeo")} />
        <div className="cmp-sub">Capital intensity and operating shape</div>
        <Expand onClick={z("ccintensity")} />
        <MiniPairs panels={toPairRows(d.intensity)} aLabel={d.aTicker} bLabel={d.bTicker} />
        <div className="cmp-sub">Statement structure</div>
        <div className="cmp-trait-head">
          <span />
          <span className="ta-c">{d.aTicker}</span>
          <span className="ta-c">{d.bTicker}</span>
        </div>
        {d.traits.map((t) => (
          <div className="cmp-trait-row" key={t.label}>
            <span className="cmp-basis-k">{t.label}</span>
            <span className={`cmp-mark${t.aMark === "yes" ? " is-yes" : ""}`}>{t.aMark}</span>
            <span className={`cmp-mark${t.bMark === "yes" ? " is-yes" : ""}`}>{t.bMark}</span>
          </div>
        ))}
        <div className="hub-note">{d.traitsNote}</div>
        <div className="hub-note">{d.modelNote}</div>

      </Section>

      <Section n="04" title="Disclosure & governance" src="each filer’s position in the full filer universe" id="c4">
        {d.gov.map((g) => (
          <div className="cmp-gov" key={g.k}>
            <div className="cmp-gov-head">
              <span className="cmp-gov-k">{g.k}</span>
              <span className="cmp-gov-labels">
                <span className="is-a">
                  {d.aTicker} {g.aLabel}
                </span>
                <span className="is-b">
                  {d.bTicker} {g.bLabel}
                </span>
                <span className="hub-hint">{g.medLabel}</span>
              </span>
            </div>
            <PeerStrip
              variant="cloud"
              peers={g.vals
                .filter((v) => v.ticker !== d.aTicker && v.ticker !== d.bTicker)
                .map((v) => ({ id: v.ticker, label: v.ticker, value: v.val }))}
              marks={[
                { id: "a", label: d.aTicker, value: g.aVal, kind: "a" },
                { id: "b", label: d.bTicker, value: g.bVal, kind: "b" },
              ]}
              quantiles={{ lo: g.min, hi: g.max, q1: g.q1, q3: g.q3, med: g.med }}
              format={(v) => String(Math.round(v * 10) / 10)}
              axisLabels={false}
              label={`${g.k} across the universe`}
            />
          </div>
        ))}
        <div className="hub-note">
          {d.govDistNote} {d.govNote}
        </div>
      </Section>

      <Section n="05" title="Managers holding both" src="from the two 13F-reported registers" id="c5">
        <Expand onClick={z("ccscatter")} />
        <div className="cmp-split">
          <div className="cmp-split-chart">
            {/*
              Each dot is one manager: its share of A against its share of B. The dashed parity
              line is equal share — distance from it is the tilt, which is why the rows beside
              this name the direction in words rather than repeating the geometry.
            */}
            <ScatterPlot
              points={d.overlap.map((m) => ({ id: m.name, label: m.short, x: m.a, y: m.b }))}
              xLabel={`share of ${d.aTicker}`}
              yLabel={`share of ${d.bTicker}`}
              parityLine
              format={(v) => `${v.toFixed(1)}%`}
              height={280}
              label="Managers holding both, share against share"
            />
          </div>
          <div className="cmp-split-side">
            {d.overlap.map((m) => (
              <div className="cmp-ov-row" key={m.name}>
                <span className="cmp-ov-id">
                  <span className="cmp-ov-name">{m.name}</span>
                  <span className="cmp-ov-tilt">{m.tilt}</span>
                </span>
                <span className="cmp-ov-a ta-r">{m.aLabel}</span>
                <span className="cmp-ov-b ta-r">{m.bLabel}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="hub-note">{d.overlapNote}</div>
      </Section>

      <Section n="06" title="Filing basis" src="what has to line up before any figure is read side by side" id="c6">
        <div className="hub-hint cmp-summary">{d.basisSummary}</div>
        {d.basis.map((r) => (
          <div className="cmp-basis" key={r.k}>
            <div className="cmp-basis-row">
              <span className="cmp-basis-k">{r.k}</span>
              <span className="hub-cell-mono">{r.a}</span>
              <span className="hub-cell-mono">{r.b}</span>
              <span className={`cmp-chip${r.aligned ? "" : " is-differs"}`}>{r.chip}</span>
            </div>
            <div className="hub-hint cmp-basis-note">{r.note}</div>
          </div>
        ))}
        <div className="hub-note">{d.basisNote}</div>
      </Section>

      <Section n="07" title="What can be compared" src="measures both filers tag, and the ones only one of them has" id="c7">
        <div className="hub-hint cmp-summary">{d.measuresSummary}</div>
        {d.measures.map((m) => (
          <div className="cmp-measure-row" key={m.k}>
            <span className="cmp-basis-k">{m.k}</span>
            <span className="cmp-measure-why">{m.why}</span>
            <span className={`cmp-chip is-end${m.both ? " is-both" : " is-absent"}`}>{m.chip}</span>
          </div>
        ))}
        <div className="hub-note">{d.measuresNote}</div>

        <div className="cmp-sub">Where this comparison breaks down</div>
        {d.limits.map((l) => (
          <div className="mgr-limit-row" key={l}>
            <span className="mgr-limit-dash">—</span>
            <span className="mgr-limit-text">{l}</span>
          </div>
        ))}
      </Section>

      {zoom && (
        <div className="cmp-zoom" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <div className="cmp-zoom-card" onClick={(e) => e.stopPropagation()}>
            <div className="cmp-zoom-head">
              <div className="cmp-zoom-title">
                <span className="cmp-zoom-h">{ZOOMS[zoom].title}</span>
                <span className="hub-hint">{ZOOMS[zoom].sub}</span>
              </div>
              <button type="button" className="cmp-zoom-close" onClick={() => setZoom(null)}>
                Close
              </button>
            </div>
            <div className="cmp-zoom-body">{zoomBody(zoom, d)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The overlay re-authors the chart at overlay width rather than scaling the small one up — the
 * charts measure their container, so a bigger box is a differently-laid-out chart, not a zoom.
 */
function zoomBody(k: string, d: ReturnType<typeof companyCompare>): ReactNode {
  const stack = (sp: StackedPair, label: string) => {
    const ramp = stackRamp(sp.segs.length);
    return (
      <>
        <StackedColumns
          columns={sp.columns.map((c) => ({
            key: c.name,
            label: `${c.name} · ${c.sub}`,
            parts: c.vals.map((v, i) => ({ key: sp.segs[i].label, label: sp.segs[i].label, value: v })),
          }))}
          format={(v) => `${v.toFixed(0)}%`}
          legend={false}
          height={440}
          label={label}
        />
        <div className="cmp-legend-col is-row">
          {sp.segs.map((seg, i) => (
            <span key={seg.label}>
              <i style={{ background: ramp[i] }} />
              {seg.label}
            </span>
          ))}
        </div>
      </>
    );
  };
  if (k === "ccstruct") return stack(d.struct, "Cost structure");
  if (k === "ccmix") return stack(d.revMix, "Revenue composition");
  if (k === "cctiming") return stack(d.timing, "Timing of revenue recognition");
  if (k === "ccgeo") return stack(d.geo, "Geographic mix");
  if (k === "cclog")
    return <LogDots rows={d.repMoney} aLabel={d.aTicker} bLabel={d.bTicker} format={money} label="Reported figures" />;
  if (k === "ccemp")
    return <LogDots rows={d.repEmp} aLabel={d.aTicker} bLabel={d.bTicker} format={(v) => Math.round(v).toLocaleString()} label="Employees" />;
  if (k === "ccconc") return <MiniPairs panels={toPairRows(d.conc)} aLabel={d.aTicker} bLabel={d.bTicker} />;
  if (k === "ccintensity") return <MiniPairs panels={toPairRows(d.intensity)} aLabel={d.aTicker} bLabel={d.bTicker} />;
  if (k === "ccscatter")
    return (
      <ScatterPlot
        points={d.overlap.map((m) => ({ id: m.name, label: m.short, x: m.a, y: m.b }))}
        xLabel={`share of ${d.aTicker}`}
        yLabel={`share of ${d.bTicker}`}
        parityLine
        format={(v) => `${v.toFixed(1)}%`}
        height={460}
        label="Managers holding both"
      />
    );
  return null;
}

function Section({
  n, title, src, id, children,
}: {
  n: string; title: string; src: string; id: string; children: React.ReactNode;
}) {
  return (
    <div className="p-card cmp-section" id={id}>
      <div className="px-group-head">
        <span className="px-group-n">{n}</span>
        <span className="hub-panel-title">{title}</span>
        <span className="hub-hint">{src}</span>
      </div>
      {children}
    </div>
  );
}
