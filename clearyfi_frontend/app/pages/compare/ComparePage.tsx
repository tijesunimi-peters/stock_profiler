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
import { STANDARD_DISCLOSURES } from "@ds";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { MiniPairs, PairBars } from "../../ui/primitives";
import { LogDots, RadarChart } from "../../charts/misc";
import { PeerStrip, SpreadOverlay } from "../../charts/strips";
import { StackedColumns } from "../../charts/bars";
import { SECTOR_ABBR, SECTOR_NAMES, BASE_PEER_COUNT, SUB_COUNTS } from "../../data/prototype";
import {
  UNIVERSE, companyCompare, sectorCompare, money,
  type PairRow, type StackedPair,
} from "../../data/compare";

const VIEWS = [
  { value: "sectors", label: "Sector vs sector" },
  { value: "companies", label: "Company vs company" },
];

export function ComparePage({ view }: { view: "sectors" | "companies" }) {
  const sel = useSelection();
  return (
    <PageShell
      subject="compare"
      title={view === "companies" ? "Compare companies" : "Compare sectors"}
      subtitle={
        view === "companies"
          ? "Two filers side by side · what lines up before any figure is compared"
          : "Two sectors side by side · composites, medians and spread"
      }
      views={VIEWS}
      activeView={view}
      onView={(v) => navigate(sel.href(`/compare/${v}`))}
      contentMax={1320}
      railWidth={178}
      disclosures={[
        STANDARD_DISCLOSURES.financials_floor,
        "No row on this page declares a winner. A/B colour is categorical identity only.",
        ...(view === "companies"
          ? [
              "Nothing here restates either filer onto the other's calendar or accounting basis. Where a basis item differs, the two columns are separate measurements shown next to each other.",
              "A measure absent from one filer's statements is omitted rather than shown as zero.",
            ]
          : [
              "Composite theme scores are provisional: the rollup method is a placeholder and the weighting is an open decision.",
            ]),
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {view === "companies" ? <CompanyCompare /> : <SectorCompare />}
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

/** Two 100%-of-itself columns — each filer's own composition, not a common template. */
function Stacked({ d, label }: { d: StackedPair; label: string }) {
  return (
    /*
      The chart draws its own legend from the same ramp it fills the bands with. A second DOM
      legend in the prototype's categorical colours would not match the bars, which is worse
      than no legend at all.
    */
    <StackedColumns
      columns={d.columns.map((c) => ({
        key: c.name,
        label: `${c.name} · ${c.sub}`,
        parts: c.vals.map((v, i) => ({ key: d.segs[i].label, label: d.segs[i].label, value: v })),
      }))}
      format={(v) => `${v.toFixed(0)}%`}
      height={280}
      label={label}
    />
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
                    <span className={`cmp-card-fill is-${side}`} style={{ width: `${(v / max) * 100}%` }} />
                    <span className="cmp-card-v">{lab}</span>
                  </div>
                );
              })}
            </div>
            <div className="cmp-card-spread">
              <SpreadOverlay
                bands={[
                  { id: "a", label: d.aName, ...m.spreadA, kind: "a" },
                  { id: "b", label: d.bName, ...m.spreadB, kind: "b" },
                ]}
                format={m.fmt}
                label={`${m.name} spread`}
              />
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

function CompanyCompare() {
  const sel = useSelection();
  const d = companyCompare(sel.compareX, sel.compareY);

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
        <Stacked d={d.struct} label="Cost structure" />
        <div className="hub-note">{d.structNote}</div>
        <div className="cmp-sub">Cash, capital and balance-sheet ratios</div>
        <PairBars rows={toPairRows(d.csRest)} aLabel={d.aTicker} bLabel={d.bTicker} />
        <div className="hub-note">{d.csNote}</div>
      </Section>

      <Section n="02" title="Reported figures, as filed" src="logarithmic axis — two filers of very different size stay legible" id="c2">
        <LogDots rows={d.repMoney} aLabel={d.aTicker} bLabel={d.bTicker} format={money} label="Reported figures on a log axis" />
        <div className="cmp-sub">Headcount · 10-K human-capital disclosure</div>
        <LogDots rows={d.repEmp} aLabel={d.aTicker} bLabel={d.bTicker} format={(v) => Math.round(v).toLocaleString()} label="Employees" />
        <div className="hub-note">
          {d.repNote} Position on the axis is the order of magnitude; the ratio at the right of each
          row states the relationship exactly.
        </div>
      </Section>

      <Section n="03" title="Business model" src="how each filer says it earns, and from whom" id="c3">
        <div className="cmp-sub">Revenue composition · ASC 606 disaggregation</div>
        <Stacked d={d.revMix} label="Revenue composition" />
        <div className="cmp-sub">Timing of revenue recognition</div>
        <Stacked d={d.timing} label="Timing of revenue recognition" />
        <div className="cmp-sub">Customer concentration</div>
        <MiniPairs panels={toPairRows(d.conc)} aLabel={d.aTicker} bLabel={d.bTicker} />
        <div className="hub-note">{d.concNote}</div>
        <div className="cmp-sub">Geographic mix</div>
        <Stacked d={d.geo} label="Geographic mix" />
        <div className="cmp-sub">Capital intensity and operating shape</div>
        <MiniPairs panels={toPairRows(d.intensity)} aLabel={d.aTicker} bLabel={d.bTicker} />
        <div className="hub-note">{d.modelNote}</div>
      </Section>

      <Section n="04" title="Disclosure & governance" src="how each filer files, against the whole universe" id="c4">
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
        <div className="hub-note">{d.govDistNote}</div>
        <div className="hub-note">{d.govNote}</div>
      </Section>

      <Section n="05" title="Managers holding both" src="from the two 13F registers" id="c5">
        {d.overlap.map((m) => {
          const max = Math.max(...d.overlap.flatMap((o) => [o.a, o.b])) || 1;
          return (
            <div className="cmp-ov-row" key={m.name}>
              <span className="cmp-ov-name">{m.name}</span>
              <span className="cmp-ov-bars">
                <span className="cmp-ov-bar">
                  <span className="is-a" style={{ width: `${(m.a / max) * 100}%` }} />
                </span>
                <span className="cmp-ov-bar">
                  <span className="is-b" style={{ width: `${(m.b / max) * 100}%` }} />
                </span>
              </span>
              <span className="hub-cell-mono ta-r">{m.aLabel}</span>
              <span className="hub-cell-mono ta-r">{m.bLabel}</span>
              <span className="hub-hint ta-r">{m.tilt}</span>
            </div>
          );
        })}
        <div className="hub-note">{d.overlapNote}</div>
      </Section>

      <Section n="06" title="Filing basis" src="what has to line up before any figure is compared" id="c6">
        <div className="hub-hint cmp-summary">{d.basisSummary}</div>
        {d.basis.map((r) => (
          <div className="cmp-basis-row" key={r.k}>
            <span className="cmp-basis-k">{r.k}</span>
            <span className="hub-cell-mono">{r.a}</span>
            <span className="hub-cell-mono">{r.b}</span>
            <span className={`cmp-chip${r.aligned ? "" : " is-differs"}`}>{r.chip}</span>
            <span className="hub-hint cmp-basis-note">{r.note}</span>
          </div>
        ))}
        <div className="hub-note">{d.basisNote}</div>
      </Section>

      <Section n="07" title="What can be compared" src="which measures both filers actually tag" id="c7">
        <div className="hub-hint cmp-summary">{d.measuresSummary}</div>
        {d.measures.map((m) => (
          <div className="cmp-measure-row" key={m.k}>
            <span className="cmp-basis-k">{m.k}</span>
            <span className={`cmp-chip${m.both ? " is-both" : " is-absent"}`}>{m.chip}</span>
            <span className="hub-hint">{m.why}</span>
          </div>
        ))}
        <div className="hub-note">{d.measuresNote}</div>

        <div className="cmp-sub">Structural traits</div>
        {d.traits.map((t) => (
          <div className="cmp-trait-row" key={t.label}>
            <span className="cmp-basis-k">{t.label}</span>
            <span className={`cmp-chip${t.aMark === "yes" ? " is-both" : " is-absent"}`}>
              {d.aTicker} {t.aMark}
            </span>
            <span className={`cmp-chip${t.bMark === "yes" ? " is-both" : " is-absent"}`}>
              {d.bTicker} {t.bMark}
            </span>
            <span className="hub-hint">{t.differs ? "differs" : ""}</span>
          </div>
        ))}
        <div className="hub-note">{d.traitsNote}</div>

        <div className="cmp-sub">What this comparison cannot do</div>
        {d.limits.map((l) => (
          <div className="mgr-limit-row" key={l}>
            <span className="mgr-limit-dash">—</span>
            <span className="mgr-limit-text">{l}</span>
          </div>
        ))}
      </Section>
    </div>
  );
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
