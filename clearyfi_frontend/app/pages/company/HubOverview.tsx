/**
 * Company Hub → Overview, ported from the prototype.
 *
 * A breadcrumb header, the "What changed this filing" band, then eight numbered sections that
 * the rail's jump list addresses by ordinal: identity & structure, financial detail, segments &
 * geography, capital & ownership, governance & people, accounting quality & audit, obligations
 * & contingencies, disclosure change.
 *
 * Every panel names the form it came from in its own header — that is the hub's organising
 * claim: this is not "a company page", it is everything that filer filed, grouped by what it
 * was filed on.
 */
import { useState } from "react";
import { StateBlock, StatusChip } from "@ds";
import {
  HUB_SECTIONS, LABEL_TO_ID, unitFmt, HUB_CALCS, type HubCalc, type SnapshotTile,
} from "../../data/hub-catalog";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { SeriesChart, Sparkline } from "../../charts/series";
import { SECTOR_NAMES } from "../../data/sector-catalog";
import { useSelection } from "../../state";
import { navigate } from "../../router";

/**
 * The hub's section header: mono ordinal, Hanken 800 title, and the SOURCE FORM inline — all
 * on one rule. Narrower than the sector altitude's header because the hub stacks eight of them.
 */
function HubHead({
  n,
  title,
  src,
  id,
  synthetic,
}: {
  n: string;
  title: string;
  src: string;
  id: string;
  /** Why this section's figures are NOT from filings. Marks the whole section, not one card. */
  synthetic?: string;
}) {
  return (
    <div className="hub-head" id={id}>
      <span className="hub-head-n">{n}</span>
      <span className="hub-head-title">{title}</span>
      <span className="hub-head-src">{synthetic ? "not from filings" : src}</span>
      {/*
       * A SECTION-level marker, because the problem is section-level.
       *
       * As §01 and §02 went onto real filings, this page stopped being uniformly synthetic and
       * started being a mixture — which is the most dangerous state it can be in, because the
       * sections look identical and a reader has no way to tell which numbers are Apple's and
       * which are generated from a hash of "AAPL". Per-card chips would not carry it: the claim
       * is about every figure below this heading.
       */}
      {synthetic ? (
        <span className="hub-head-synth" title={synthetic}>
          <StatusChip status="na" /> Deferred — figures below are synthetic
        </span>
      ) : null}
    </div>
  );
}

/**
 * A link out to the filing the panel above it was built from.
 *
 * Every panel on this page carries one. That is the hub's organising claim made checkable: we
 * are not asking to be believed about what a filer disclosed, we are handing over the document.
 */
function Src({ href, children }: { href: string; children: string }) {
  return (
    <a className="hub-src-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * The chip that opens a derived figure's arithmetic.
 *
 * `ƒ` marks it as ours rather than the filer's — the one visual cue that separates a number we
 * computed from a number that was reported, which is a distinction the whole product rests on.
 */
function CalcChip({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`hub-calc-chip${open ? " is-open" : ""}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? `Hide how ${label} is computed` : `Show how ${label} is computed`}
    >
      {open ? "ƒ hide" : "ƒ derived"}
    </button>
  );
}

/** The drawer behind a `CalcChip`: formula, the inputs it reads, and where each one comes from. */
function CalcDrawer({ calc }: { calc: HubCalc }) {
  return (
    <div className="hub-calc">
      <div className="hub-label">How this is computed</div>
      <div className="hub-calc-formula">{calc.formula}</div>
      {calc.inputs.map(([k, v]) => (
        <div className="hub-calc-row" key={k}>
          <span className="hub-cell">{k}</span>
          <span className="hub-cell-mono is-soft">{v}</span>
        </div>
      ))}
      <div className="hub-note">{calc.note}</div>
    </div>
  );
}

/*
 * The fiscal key this page reads.
 *
 * A constant for now because the app carries no real period state — `state.tsx` pins
 * `period: "2026-Q1"` as a compatibility shim. Named here rather than inlined so Phase A has one
 * place to thread the reader's actual selection through, and so the three-vocabulary problem
 * (fiscal pair vs 13F quarter-end vs lookback count) is visible at the call site.
 */
/**
 * A footnote figure. `N/A` renders as the status chip rather than the letters, and a `reason`
 * rides the title — so "the filer did not disclose this" and "we cannot source it" stay legible
 * as different things on a card that shows both.
 */
function Fig({ v, reason }: { v: string; reason?: string | null }) {
  return <span title={reason ?? undefined}>{v === "N/A" ? <StatusChip status="na" /> : v}</span>;
}

/**
 * What a footnote card shows when the filer disclosed nothing.
 *
 * Footnote disclosure is optional, so this is usually the filer's choice rather than our gap —
 * and the two are indistinguishable from outside a card. The reason from the API carries how many
 * filers publish the group at all, which is what lets a reader tell which they are looking at.
 */
function FootnoteEmpty({ reason }: { reason: string | null }) {
  return (
    <div className="hub-note">
      {reason ?? "Not disclosed by this filer for this period."}
    </div>
  );
}

const HUB_YEAR = 2026;
const HUB_PERIOD = "Q1";

const STMT_TABS = [
  { key: "income", label: "Income statement" },
  { key: "balance", label: "Balance sheet" },
  { key: "cash", label: "Cash flow" },
] as const;

export function HubOverview() {
  const sel = useSelection();
  const T = sel.focal;
  const subActive = sel.subIdx >= 0;

  /*
   * Seven reads, grouped by the BACKEND read pattern they will become — not by the section they
   * feed. `data/api.ts` documents which endpoints replace each body at Phase A; the point of
   * drawing the boundaries here is that the swap is a body change, not another refactor.
   *
   * The `year`/`fiscalPeriod` pair is threaded even though the fixture ignores it: the real
   * `/metrics` and `/statements` both REQUIRE a year, and a `FiscalPeriod` carries none of its own.
   * Passing it now is what stops Phase A having to re-thread it through every call site.
   */
  const identity = useApi(() => api.companyIdentity(T, sel.subIdx), [T, sel.subIdx]);
  const financials = useApi(() => api.companyFinancials(T, HUB_YEAR, HUB_PERIOD), [T]);
  const footnotes = useApi(() => api.companyFootnotes(T, HUB_YEAR, HUB_PERIOD), [T]);
  const segments = useApi(() => api.companySegments(T, HUB_YEAR), [T]);
  const governance = useApi(() => api.companyGovernance(T), [T]);
  const disclosure = useApi(() => api.companyDisclosure(T), [T]);

  const [stmt, setStmt] = useState<"income" | "balance" | "cash">("income");
  // One open drawer at a time, and one shared range/basis across every drawer — the axis
  // controls belong to the reader's question, not to the row they happened to open it from.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [range, setRange] = useState<"8q" | "20q" | "5y">("8q");
  const [basis, setBasis] = useState<"filed" | "restated">("filed");
  const [tray, setTray] = useState<string[]>([]);
  const [trayOpen, setTrayOpen] = useState(true);
  // One open calc drawer and one open snapshot tile at a time — both are asides to the panel
  // they hang off, and two of them open at once turns the page into a stack of interruptions.
  const [calc, setCalc] = useState<string | null>(null);
  const [tile, setTile] = useState<string | null>(null);

  const sector = SECTOR_NAMES[sel.sectorIdx];
  const toggleCalc = (id: string) => setCalc((c) => (c === id ? null : id));

  /*
   * Gate on ALL SEVEN, after every hook. Once these are real endpoints the sensible thing is to
   * paint each section as its own read lands; today they resolve in the same tick, so a
   * per-section skeleton would be theatre. Progressive paint belongs in Phase A, where the
   * latency is real and the choice can be measured.
   */
  const reads = [identity, financials, footnotes, segments, governance, disclosure];
  const failed = reads.find((r) => r.error);
  if (failed) return <StateBlock variant="error" copy={failed.error!.message} />;
  if (!identity.data || !financials.data || !footnotes.data || !segments.data || !governance.data || !disclosure.data) {
    return <StateBlock variant="loading" copy="Reading this filer's facts." />;
  }

  const L = identity.data.links;
  const snapshot = financials.data.snapshot;
  const insider = governance.data.insider;

  /*
   * The section payloads, re-assembled under the shape the JSX below already reads.
   *
   * This is the ADAPTER boundary in miniature (operator ruling 2026-08-02): the seam hands back
   * whatever the endpoint family returns, and the view is handed the shape it renders. It renames
   * and regroups; it computes nothing. Keeping the render code untouched is also what makes the
   * before/after DOM diff meaningful — a refactor that rewrites the markup cannot prove it
   * changed nothing.
   */
  const d = {
    changes: disclosure.data.changes,
    structure: identity.data.structure,
    years: financials.data.years,
    statements: financials.data.statements,
    segments: segments.data.segments,
    segNote: segments.data.segNote,
    geoAssets: segments.data.geoAssets,
    custConc: segments.data.custConc,
    capital: footnotes.data.capital,
    governance: governance.data.governance,
    audit: disclosure.data.audit,
    obligations: footnotes.data.obligations,
    footnotes: footnotes.data.footnotes,
    footnotePeriod: footnotes.data.footnotePeriod,
    narrative: disclosure.data.narrative,
    covenant: footnotes.data.covenant,
  };

  return (
    <div className="hub">
      {/* breadcrumb */}
      <div className="hub-crumb">
        <span className="hub-crumb-sector">{sector}</span>
        <span className="hub-crumb-sep">›</span>
        <span className="hub-crumb-name">{T}</span>
        <span className="hub-crumb-ticker">{T}</span>
        <span className="hub-crumb-spacer" />
        <span className="hub-crumb-pill">{identity.data.contextPill}</span>
        <button
          type="button"
          className="hub-crumb-link"
          onClick={() => navigate(sel.href(`/company/${T}/peers`))}
        >
          Peer-relative view →
        </button>
      </div>

      {/* what changed this filing */}
      <div className="hub-changed">
        <div className="hub-changed-head">
          <span className="hub-changed-title">What changed this filing</span>
          <span className="hub-hint">
            diffed against the prior annual report · change is described, not scored
          </span>
        </div>
        <div className="hub-changed-rows">
          {d.changes.map((c) => (
            <div className="hub-changed-row" key={c.tag}>
              <span className="hub-changed-tag">{c.tag}</span>
              <span className="hub-changed-text">{c.text}</span>
              <span className="hub-changed-src">{c.src}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ 01 */}
      <section className="hub-sec">
        <HubHead id="s1" n="01" title="Identity & structure" src="cover page · EX-21 · 10-K Item 1" />
        <div className="hub-grid is-wide">
          <div className="p-card">
            <div className="hub-label">What the company does · 10-K Item 1</div>
            <p className="hub-prose">{identity.data.bizText}</p>
            <div className="hub-chips">
              {identity.data.segmentChips.map((s) => (
                <span className="hub-chip" key={s.label}>
                  <i style={{ background: s.color }} />
                  {s.label} <b>{s.pct}</b>
                </span>
              ))}
            </div>
          </div>
          <div className="p-card is-tint">
            <div className="hub-label">Registrant profile · cover page</div>
            <div className="hub-profile">
              {identity.data.profile.map((p) => (
                <div className="hub-profile-cell" key={p.k}>
                  <span className="hub-profile-k">{p.k}</span>
                  {/* A chip ONLY on N/A (D-chips). `reason` distinguishes "we cannot source this,
                      and here is why" from "EDGAR simply did not state it for this filer" —
                      different facts, and a reader who hovers gets the difference. */}
                  {/* The chip carries its OWN "N/A" label, so rendering the value text as well
                      read as "N/A ⊘ N/A". The chip is the value here — glyph and label together,
                      which is the vocabulary's whole point (never colour alone). */}
                  <span className="hub-profile-v" title={p.reason}>
                    {p.v === "N/A" ? <StatusChip status="na" /> : p.v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-card hub-mt-lg">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Consolidated subsidiaries</span>
            <span className="hub-hint">
              {d.structure.subCount === null
                ? "EX-21 · count unknown"
                : `EX-21 · ${d.structure.subCount} entities · ${d.structure.offshore} organized outside the U.S.`}
            </span>
            <Src href={L.ex21}>Read EX-21 ↗</Src>
          </div>
          <div className="hub-table-head hub-subs-grid">
            <span>Entity</span>
            <span>Jurisdiction</span>
            <span className="ta-r">Ownership</span>
          </div>
          {d.structure.subs.length ? (
            d.structure.subs.map((s) => (
              <div className="hub-subs-grid hub-row" key={s.name}>
                <span className="hub-cell">{s.name}</span>
                <span className="hub-cell-mono">
                  {s.jur === "N/A" ? <StatusChip status="na" /> : s.jur}
                </span>
                {/* A blank ownership column is NOT 100% — most filers publish none at all. */}
                <span className="hub-cell-mono ta-r">
                  {s.own === "N/A" ? <StatusChip status="na" /> : s.own}
                </span>
              </div>
            ))
          ) : (
            /* An empty TABLE would read as "this filer has no subsidiaries" — a claim about the
               company, when the truth is a claim about us. The reason comes from the API so it
               names THIS filer's actual gap (no annual report indexed / prose exhibit / no EX-21)
               rather than one blanket explanation that fits none of them exactly. */
            <StateBlock
              variant="empty"
              title="Not ingested"
              copy={d.structure.subReason ?? undefined}
            />
          )}
          <div className="hub-note">{d.structure.note}</div>
        </div>
      </section>

      {/* ============================================================ 02 */}
      <section className="hub-sec">
        <HubHead id="s2" n="02" title="Financial detail" src="statements & footnotes · XBRL facts as filed" />
        <div className="p-card">
          <div className="hub-panel-head is-split">
            <span className="hub-panel-title">Condensed statements</span>
            <div className="hub-tabs">
              {STMT_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`hub-tab${stmt === t.key ? " is-active" : ""}`}
                  onClick={() => setStmt(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hub-table-head hub-stmt-grid">
            <span />
            {d.years.map((y) => (
              <span key={y} className="ta-r">
                {y}
              </span>
            ))}
          </div>
          {d.statements[stmt].map((r) => {
            const mid = LABEL_TO_ID[r.label];
            const isOpen = openRow === r.label;
            return (
              <div key={r.label}>
                <div
                  className={`hub-stmt-grid hub-row${r.strongRule ? " is-strong" : ""}${mid ? " is-clickable" : ""}`}
                  onClick={() => mid && setOpenRow(isOpen ? null : r.label)}
                >
                  <span className={`hub-cell${r.bold ? " is-bold" : ""}`}>
                    <span className={mid ? "hub-cue" : undefined}>{r.label}</span>
                    {r.derived && <span className="hub-derived">derived</span>}
                    {mid && (
                      <button
                        type="button"
                        className={`hub-tray-add${tray.includes(mid) ? " is-in" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTray((x) => (x.includes(mid) ? x.filter((k) => k !== mid) : [...x, mid]));
                          setTrayOpen(true);
                        }}
                      >
                        {tray.includes(mid) ? "− in tray" : "+ compare"}
                      </button>
                    )}
                  </span>
                  {/* `reason` marks a line we cannot source at all — "Total debt" would mean
                      adding two reported numbers together. A value that is merely absent for one
                      period is a plain N/A: different facts, so they read differently. */}
                  {r.vals.map((v, i) => (
                    <span className="hub-cell-mono ta-r" key={i} title={r.reason}>
                      {v === "N/A" ? <StatusChip status="na" /> : v}
                    </span>
                  ))}
                </div>
                {isOpen && mid && <TrendDrawer T={T} id={mid} range={range} setRange={setRange} basis={basis} setBasis={setBasis} />}
              </div>
            );
          })}

          <div className="hub-panel-foot">
            <span className="hub-note no-mt">Amounts as originally filed.</span>
            <CalcChip label={HUB_CALCS.fcf.label} open={calc === "fcf"} onToggle={() => toggleCalc("fcf")} />
            <Src href={L.tenQ}>Read the 10-Q ↗</Src>
            <Src href={L.tenK}>10-K ↗</Src>
          </div>
          {calc === "fcf" && <CalcDrawer calc={HUB_CALCS.fcf} />}
        </div>

        {/* financial snapshot — eight XBRL facts with their trailing shape */}
        <div className="p-card hub-mt-lg">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Financial snapshot</span>
            <span className="hub-hint">
              XBRL facts · trailing 8 quarters · arrows show direction only, not favorability (§5)
            </span>
          </div>
          <div className="hub-snap-grid">
            {snapshot.map((m) => (
              <SnapTile
                key={m.label}
                m={m}
                open={tile === m.label}
                onOpen={() => setTile((x) => (x === m.label ? null : m.label))}
                inTray={tray.includes(LABEL_TO_ID[m.label] ?? "")}
                onTray={() => {
                  const id = LABEL_TO_ID[m.label];
                  if (!id) return;
                  setTray((x) => (x.includes(id) ? x.filter((k) => k !== id) : [...x, id]));
                  setTrayOpen(true);
                }}
              />
            ))}
          </div>
          {snapshot.map((m) =>
            tile === m.label && LABEL_TO_ID[m.label] ? (
              <TrendDrawer
                key={m.label}
                T={T}
                id={LABEL_TO_ID[m.label]}
                range={range}
                setRange={setRange}
                basis={basis}
                setBasis={setBasis}
              />
            ) : null,
          )}
        </div>

        {/* The PERIOD is on the divider on purpose. Footnotes are annual disclosures, so these
            cards are FY figures sitting directly under quarterly statements — a reader comparing
            the two without knowing that would draw a false conclusion from a real number. */}
        <div className="hub-divider">
          Footnote detail — where the explanation usually lives · {d.footnotePeriod}
        </div>

        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Revenue disaggregation · ASC 606</span>
              <Src href={L.tenK}>Read the footnote ↗</Src>
            </div>
            {/* The product/service split is DIMENSIONAL (ASC 606 axis) and lands in Phase C.
                An empty card is the honest state; a plausible 72/16/12 attached to a real filer
                would be a fabricated revenue mix. */}
            <FootnoteEmpty reason="Revenue disaggregation is an ASC 606 dimensional disclosure, which we do not ingest yet — so no split is shown rather than an invented one." />
            <div className="hub-kv-row hub-mt-sm">
              <span className="hub-cell">Remaining performance obligations</span>
              <span className="hub-cell-mono">
                <Fig v={d.footnotes.rpo.tot} reason={d.footnotes.rpo.reason} />
              </span>
            </div>
            <div className="hub-note">
              {d.footnotes.rpo.within12 === "N/A"
                ? (d.footnotes.rpo.reason ?? "Not disclosed for this period.")
                : `${d.footnotes.rpo.within12} expected to be recognized within 12 months`}
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Inventory composition</span>
              <Src href={L.tenK}>Read the footnote ↗</Src>
            </div>
            {d.footnotes.inv.length ? (
              d.footnotes.inv.map((x) => (
                <div className="hub-tri-row is-amt" key={x.label}>
                  <span className="hub-cell">{x.label}</span>
                  <span className="hub-cell-mono ta-r">{x.amt}</span>
                  {/* Year-over-year needs the prior period's footnote, which is a second read we
                      do not make. Absent rather than computed from one column. */}
                  <span className="hub-cell-mono ta-r is-soft"><Fig v={x.yoy} /></span>
                </div>
              ))
            ) : (
              <FootnoteEmpty reason={d.footnotes.invReason} />
            )}
            <div className="hub-note">
              Work-in-process and finished-goods build-ups are disclosed before any excess reserve
              is recorded — read alongside the excess-and-obsolescence estimate.
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Debt maturity ladder</span>
              <Src href={L.tenK}>Read the debt footnote ↗</Src>
            </div>
            {d.footnotes.debtLadder.length ? (
              d.footnotes.debtLadder.map((x) => (
                <div className="hub-ladder-row" key={x.y}>
                  <span className="hub-cell-mono is-soft">{x.y}</span>
                  <span className="hub-commit-track">
                    <span style={{ width: x.w }} />
                  </span>
                  <span className="hub-cell-mono ta-r">{x.amt}</span>
                  {/* The per-bucket interest rate is not a tagged fact — it lives in the debt
                      footnote's prose table. */}
                  <span className="hub-cell-mono ta-r is-soft"><Fig v={x.rate} /></span>
                </div>
              ))
            ) : (
              <FootnoteEmpty reason={d.footnotes.debtReason} />
            )}
            <div className="hub-note">Covenants: {d.covenant}</div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Effective tax rate reconciliation</span>
              <CalcChip label={HUB_CALCS.etr.label} open={calc === "etr"} onToggle={() => toggleCalc("etr")} />
            </div>
            {d.footnotes.tax.rows.length ? (
              d.footnotes.tax.rows.map((x) => (
                <div className="hub-kv-row" key={x.k}>
                  <span className="hub-cell">{x.k}</span>
                  <span className="hub-cell-mono">{x.v}</span>
                </div>
              ))
            ) : (
              <FootnoteEmpty reason={d.footnotes.tax.reason} />
            )}
            <div className="hub-kv-row is-total">
              <span className="hub-cell is-bold">Effective rate</span>
              <span className="hub-cell-mono is-bold">
                <Fig v={d.footnotes.tax.eff} reason={d.footnotes.tax.reason} />
              </span>
            </div>
            <div className="hub-note">
              Valuation allowance {d.footnotes.tax.va} · unrecognized tax benefits{" "}
              {d.footnotes.tax.utb}
            </div>
            {calc === "etr" && <CalcDrawer calc={HUB_CALCS.etr} />}
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Deferred revenue roll-forward</span>
              <Src href={L.tenK}>Read the footnote ↗</Src>
            </div>
            <div className="hub-quad">
              {[
                ["Opening balance", d.footnotes.defrev.open],
                ["Billed / deferred", d.footnotes.defrev.billed],
                ["Recognized in revenue", d.footnotes.defrev.rec],
                ["Closing balance", d.footnotes.defrev.close],
              ].map(([k, v]) => (
                <div className="hub-roll-cell" key={k}>
                  <span className="hub-hint">{k}</span>
                  <span className="hub-roll-v">{v}</span>
                </div>
              ))}
            </div>
            <div className="hub-foot-rule">
              <div className="hub-label">Allowance for credit losses</div>
              <div className="hub-cell-mono is-soft">
                {d.footnotes.allow.open} opening · +{d.footnotes.allow.prov} provision · −
                {d.footnotes.allow.wo} write-offs · {d.footnotes.allow.close} closing
              </div>
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Stock compensation by line item</span>
              <Src href={L.tenK}>Read the footnote ↗</Src>
            </div>
            {d.footnotes.sbc.lines.length ? (
              d.footnotes.sbc.lines.map((x) => (
                <div className="hub-comp-row" key={x.label}>
                  <div className="hub-comp-head">
                    <span className="hub-cell">{x.label}</span>
                    <span className="hub-cell-mono">{x.amt}</span>
                  </div>
                  <div className="hub-comp-track">
                    <div style={{ width: x.w }} />
                  </div>
                </div>
              ))
            ) : (
              /* Total SBC is a single tagged fact; the split ACROSS LINE ITEMS is dimensional.
                 The total lives in the note below, so the card is not empty — only the split is. */
              <FootnoteEmpty reason="Stock compensation by line item needs the by-line dimensional facts, which we do not ingest yet. The total is below." />
            )}
            <div className="hub-note">
              Total {d.footnotes.sbc.tot} · R&amp;D capitalization: {d.footnotes.capR.cap}{" "}
              capitalized vs {d.footnotes.capR.exp} expensed
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Goodwill by reporting unit</span>
              <CalcChip label={HUB_CALCS.gwhead.label} open={calc === "gwhead"} onToggle={() => toggleCalc("gwhead")} />
            </div>
            {d.footnotes.gwUnits.length ? (
              d.footnotes.gwUnits.map((g, i) => (
                <div className="hub-tri-row is-amt" key={`${g.name}${i}`}>
                  <span className="hub-cell">{g.name}</span>
                  <span className="hub-cell-mono ta-r">{g.gw}</span>
                  <span className="hub-cell-mono ta-r is-soft">{g.head} headroom</span>
                </div>
              ))
            ) : (
              /* Without this the card renders its LEASES footer alone, under a heading about
                 goodwill — a real number sitting under the wrong title. Reporting-unit goodwill
                 is dimensional, and headroom is a prose disclosure we would have to invent. */
              <FootnoteEmpty reason="Goodwill by reporting unit is a dimensional disclosure we do not ingest yet, and impairment headroom is not a tagged fact." />
            )}
            {calc === "gwhead" && <CalcDrawer calc={HUB_CALCS.gwhead} />}
            <div className="hub-note">
              Leases: {d.footnotes.leases.tot} liability · {d.footnotes.leases.wa}{" "}
              weighted-average term · {d.footnotes.leases.disc} discount rate
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 03 */}
      <section className="hub-sec">
        <HubHead
          id="s3"
          n="03"
          title="Segments & geography"
          src="ASC 280 · 10-K segment footnote"
          synthetic="Segment and geographic splits are DIMENSIONAL facts (ASC 280 axes), which live only in DERA's num.txt segments column — not in companyfacts. Phase C ingests them. Until then every figure in this section is generated from the ticker."
        />
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Reportable segments</span>
            <span className="hub-hint">revenue and operating income as disclosed</span>
            <CalcChip label={HUB_CALCS.segmargin.label} open={calc === "segmargin"} onToggle={() => toggleCalc("segmargin")} />
            <Src href={L.tenK}>Read the segment footnote ↗</Src>
          </div>
          <div className="hub-table-head hub-seg-grid">
            <span>Segment</span>
            <span className="ta-r">Revenue</span>
            <span className="ta-r">Op. income</span>
            <span>Operating margin</span>
            <span className="ta-r">Assets</span>
          </div>
          {d.segments.map((s) => (
            <div className="hub-seg-grid hub-row" key={s.name}>
              <span className="hub-seg-name">
                <i style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="hub-cell-mono ta-r">{s.rev}</span>
              <span className="hub-cell-mono ta-r">{s.op}</span>
              <span className="hub-seg-margin">
                <span className="hub-seg-track">
                  <span style={{ width: s.marginW }} />
                </span>
                <span className="hub-cell-mono">{s.margin}</span>
              </span>
              <span className="hub-cell-mono ta-r">{s.assets}</span>
            </div>
          ))}
          <div className="hub-note">{d.segNote}</div>
          {calc === "segmargin" && <CalcDrawer calc={HUB_CALCS.segmargin} />}
        </div>

        <div className="hub-grid hub-mt">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Long-lived assets by country</span>
              <Src href={L.tenK}>Read the segment footnote ↗</Src>
            </div>
            {d.geoAssets.map((g) => (
              <div className="hub-geo-row" key={g.name}>
                <span className="hub-seg-name">
                  <i style={{ background: g.color }} />
                  {g.name}
                </span>
                <span className="hub-cell-mono ta-r">{g.amt}</span>
                <span className="hub-cell-mono ta-r is-soft">{g.w}</span>
              </div>
            ))}
          </div>
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">
                Customer concentration · filers must name any customer &gt;10%
              </span>
              <Src href={L.tenK}>Read Item 1 ↗</Src>
            </div>
            {d.custConc.map((c) => (
              <div className="hub-cust-row" key={c.label}>
                <span className="hub-cell">
                  {c.label} <span className="hub-hint">{c.kind}</span>
                </span>
                <span className="hub-cust-pct">{c.pct}</span>
              </div>
            ))}
            <div className="hub-note">
              Customers are identified only where the filer names them; percentages are of
              consolidated revenue.
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 04 */}
      <section className="hub-sec">
        <HubHead id="s4" n="04" title="Capital & ownership" src="cash flow statement · 10-Q Item 5 · DEF 14A · 13D/G" />
        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Share count roll-forward</span>
              <Src href={L.tenQ}>Read the 10-Q ↗</Src>
            </div>
            {d.capital.roll.map((r) => (
              <div className="hub-kv-row" key={r.k}>
                <span className="hub-cell">{r.k}</span>
                <span className="hub-cell-mono">{r.v}</span>
              </div>
            ))}
            <div className="hub-label hub-mt-sm">Dilution overhang</div>
            <div className="hub-cell-mono is-soft">
              {d.capital.overhang.opts} options · {d.capital.overhang.rsu} unvested RSUs ·{" "}
              <b>{d.capital.overhang.pct}</b> of shares out
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Repurchase program</span>
              <Src href={L.tenQ}>Read 10-Q Item 5 ↗</Src>
            </div>
            <div className="hub-quad">
              <div>
                <span className="hub-hint">Authorized</span>
                <div className="hub-big">{d.capital.buyback.auth}</div>
              </div>
              <div>
                <span className="hub-hint">Remaining</span>
                <div className="hub-big">{d.capital.buyback.remaining}</div>
              </div>
              <div>
                <span className="hub-hint">Repurchased, quarter</span>
                <div className="hub-big">{d.capital.buyback.qtr}</div>
              </div>
              <div>
                <span className="hub-hint">Source</span>
                <div className="hub-cell-mono is-soft hub-mt-xs">{d.capital.buyback.src}</div>
              </div>
            </div>
            <div className="hub-foot-rule">
              {d.capital.shelf} · {d.capital.convert}
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Class structure &amp; voting</span>
              <Src href={L.proxy}>Read the proxy ↗</Src>
            </div>
            {d.capital.classes.map((c) => (
              <div className="hub-tri-row is-narrow" key={c.c}>
                <span className="hub-cell">{c.c}</span>
                <span className="hub-cell-mono ta-r">{c.sh}</span>
                <span className="hub-cell-mono ta-r is-soft">{c.v}</span>
              </div>
            ))}
            <div className="hub-note">
              Insider ownership {d.capital.insiderOwn} of shares outstanding (DEF 14A beneficial
              ownership table)
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Reported blockholders · 13D/G</span>
              <Src href={L.all}>EDGAR filings ↗</Src>
            </div>
            {d.capital.holders.map((h) => (
              <div className="hub-tri-row is-narrow" key={h.name}>
                <span className="hub-cell">{h.name}</span>
                <span className="hub-cell-mono ta-r">{h.pct}</span>
                <span className="hub-cell-mono ta-r is-soft">{h.form}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ 05 */}
      <section className="hub-sec">
        <HubHead id="s5" n="05" title="Governance & people" src="DEF 14A · 8-K Item 5.02 · Forms 3/4/5" />
        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Officer &amp; director changes</span>
              <Src href={L.eightK}>Read the 8-Ks ↗</Src>
            </div>
            {d.governance.turnover.map((t, i) => (
              <div className="hub-tri-row" key={`${t.role}${i}`}>
                <span className="hub-cell">{t.role}</span>
                <span className="hub-cell-mono is-soft">{t.action}</span>
                <span className="hub-cell-mono ta-r">{t.date}</span>
              </div>
            ))}
            <div className="hub-note">Every row traces to an 8-K Item 5.02 filing.</div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Board composition</span>
              <Src href={L.proxy}>Read the proxy ↗</Src>
            </div>
            <div className="hub-quad">
              <div>
                <span className="hub-hint">Board size</span>
                <div className="hub-big is-lg">{d.governance.boardSize}</div>
              </div>
              <div>
                <span className="hub-hint">Independent</span>
                <div className="hub-big is-lg">{d.governance.indep}</div>
              </div>
              <div>
                <span className="hub-hint">Director tenure</span>
                <div className="hub-mid">{d.governance.tenure}</div>
              </div>
              <div>
                <span className="hub-hint">CEO tenure</span>
                <div className="hub-mid">{d.governance.ceoTenure}</div>
              </div>
            </div>
            <div className="hub-foot-rule">
              {d.governance.related} · {d.governance.clawback}
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">CEO pay mix · summary compensation table</span>
              <Src href={L.proxy}>Read the proxy ↗</Src>
            </div>
            {d.governance.comp.map((c) => (
              <div className="hub-comp-row" key={c.k}>
                <div className="hub-comp-head">
                  <span className="hub-cell">{c.k}</span>
                  <span className="hub-cell-mono">{c.pct}</span>
                </div>
                <div className="hub-comp-track">
                  <div style={{ width: c.w }} />
                </div>
              </div>
            ))}
            <div className="hub-note">
              Total {d.governance.ceoPay} · CEO pay ratio {d.governance.ratio} · say-on-pay support{" "}
              {d.governance.sayOnPay}
            </div>
          </div>

          {/*
            Section 16 activity, summarised. The counts are of FILINGS, not of conviction: an
            officer disposing under a 10b5-1 plan adopted a year earlier files the same Form 4
            as one selling on the day. `dir` names the direction and stops there.
          */}
          <div className="p-card">
            <div className="hub-panel-head is-split">
              <span className="hub-label no-mb">Insider transactions</span>
              <span className="hub-hint">{insider.window}</span>
            </div>
            <div className="hub-ins-summary">
              {insider.buy} acquisitions · {insider.sell} dispositions · net {insider.net} (
              {insider.dir})
            </div>
            {insider.rows.map((r, i) => (
              <div className="hub-tri-row is-top" key={`${r.off}${i}`}>
                <span className="hub-cell">{r.off}</span>
                <span className="hub-cell-mono is-soft">
                  {r.type} · {r.shares}
                </span>
                <span className="hub-cell-mono ta-r">{r.date}</span>
              </div>
            ))}
            <div className="hub-note">{d.governance.plans}</div>
            <button
              type="button"
              className="hub-nav-link"
              onClick={() => navigate(sel.href(`/company/${T}/insider`))}
            >
              Full insider activity view →
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ 06 */}
      <section className="hub-sec">
        <HubHead id="s6" n="06" title="Accounting quality & audit" src="auditor report · Item 9A · 8-K 4.01 / 4.02 · 12b-25" />
        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Auditor</span>
              <Src href={L.tenK}>Read the auditor report ↗</Src>
            </div>
            <div className="hub-firm">
              <span className="hub-firm-name">{d.audit.firm}</span>
              <span className="hub-cell-mono is-soft">{d.audit.tenure}</span>
            </div>
            <div className="hub-cell-mono is-soft hub-mt-xs">
              Fees {d.audit.fees} · {d.audit.nonAudit}
            </div>
            <div className="hub-audit-facts">
              <span>{d.audit.change}</span>
              <span>{d.audit.icfr}</span>
              <span>{d.audit.restate}</span>
              <span>{d.audit.late}</span>
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Critical audit matters</span>
              <Src href={L.tenK}>Read the CAMs ↗</Src>
            </div>
            {d.audit.cams.map((c, i) => (
              <div className="hub-cam" key={`${c.name}${i}`}>
                <div className="hub-cam-name">{c.name}</div>
                <div className="hub-note">{c.why}</div>
              </div>
            ))}
          </div>

          <div className="p-card">
            <div className="hub-label">Non-GAAP adjustments</div>
            <div className="hub-inline-stats">
              <div>
                <span className="hub-hint">Distinct adjustments</span>
                <div className="hub-big is-lg">{d.audit.nonGaap.count}</div>
              </div>
              <div>
                <span className="hub-hint">Recurrence</span>
                <div className="hub-mid">{d.audit.nonGaap.recur}</div>
              </div>
            </div>
            <div className="hub-note">
              Most frequent: {d.audit.nonGaap.items}. Recurrence is reported, not judged — a
              recurring adjustment is a fact about the reconciliation, not a verdict.
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Critical accounting estimates</span>
              <Src href={L.tenK}>Read Item 7 ↗</Src>
            </div>
            <div className="hub-estimates">
              {d.audit.estimates.map((e) => (
                <span key={e}>{e}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 07 */}
      <section className="hub-sec">
        <HubHead id="s7" n="07" title="Obligations & contingencies" src="10-K Item 3 · commitments & contingencies footnote" />
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Legal proceedings</span>
            <span className="hub-hint">
              accrual recorded only when a loss is probable and estimable (ASC 450) — "not
              estimable" means the filer disclosed a matter without a recordable amount, not that
              the exposure is zero
            </span>
            <Src href={L.tenK}>Read Item 3 ↗</Src>
          </div>
          <div className="hub-table-head hub-legal-grid">
            <span>Matter</span>
            <span>Stage</span>
            <span className="ta-r">Accrual</span>
            <span className="ta-r">Since</span>
          </div>
          {d.obligations.legal.map((l, i) => (
            <div className="hub-legal-grid hub-row" key={`${l.matter}${i}`}>
              <span className="hub-cell">{l.matter}</span>
              <span className="hub-cell-mono is-soft">{l.stage}</span>
              <span className="hub-cell-mono ta-r">{l.accrual}</span>
              <span className="hub-cell-mono ta-r is-soft">{l.since}</span>
            </div>
          ))}
          <div className="hub-note">{d.obligations.rangeNote}</div>
        </div>

        <div className="hub-grid hub-mt">
          <div className="p-card">
            <div className="hub-label">Purchase & capacity commitments</div>
            {d.obligations.commitments.map((c) => (
              <div className="hub-commit-row" key={c.y}>
                <span className="hub-cell-mono is-soft">{c.y}</span>
                <span className="hub-commit-track">
                  <span style={{ width: c.w }} />
                </span>
                <span className="hub-cell-mono ta-r">{c.amt}</span>
              </div>
            ))}
            <div className="hub-note">
              Total {d.obligations.purchase} · {d.obligations.purchaseNote}
            </div>
          </div>

          <div className="p-card">
            <div className="hub-label">Restructuring & other obligations</div>
            {d.obligations.restructuring.active && (
              <div className="hub-quad">
                <div>
                  <span className="hub-hint">Charge to date</span>
                  <div className="hub-big">{d.obligations.restructuring.charge}</div>
                </div>
                <div>
                  <span className="hub-hint">Accrual remaining</span>
                  <div className="hub-big">{d.obligations.restructuring.accrual}</div>
                </div>
                <div>
                  <span className="hub-hint">Cash paid</span>
                  <div className="hub-big">{d.obligations.restructuring.paid}</div>
                </div>
                <div>
                  <span className="hub-hint">Scope</span>
                  <div className="hub-mid">{d.obligations.restructuring.heads}</div>
                </div>
              </div>
            )}
            <div className="hub-foot-rule is-stack">
              <span>
                Guarantees {d.obligations.guarantees} · environmental {d.obligations.environmental}
              </span>
              <span>Off-balance-sheet: {d.obligations.offBS}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 08 */}
      <section className="hub-sec">
        <HubHead id="s8" n="08" title="Disclosure change" src="10-K Item 1A / 1C · MD&A · 8-K 1.01 & 2.02" />
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Risk factor diff</span>
            <span className="hub-hint">
              {d.narrative.rfCount} risk factors · {d.narrative.rfDelta} vs prior year ·{" "}
              {d.narrative.rfWords}
            </span>
            <Src href={L.tenK}>Read Item 1A ↗</Src>
          </div>
          {d.narrative.rfDiff.map((r, i) => (
            <div className="hub-rf-row" key={`${r.kind}${i}`}>
              <span className="hub-rf-kind">{r.kind}</span>
              <span className="hub-cell">{r.text}</span>
            </div>
          ))}
          <div className="hub-note">
            Added, removed, and reworded are categorical labels — no direction is implied.
          </div>
        </div>

        <div className="hub-grid hub-mt">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Management-attributed drivers · MD&amp;A</span>
              <Src href={L.tenK}>Read MD&amp;A ↗</Src>
            </div>
            <div className="hub-quotes">
              {d.narrative.mdna.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
            <div className="hub-note">
              Attribution is management's own language, quoted in condensed form — not an
              independent finding.
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Cybersecurity · Item 1C</span>
              <Src href={L.tenK}>Read Item 1C ↗</Src>
            </div>
            <div className="hub-facts">
              <span>{d.narrative.cyber.gov}</span>
              <span>{d.narrative.cyber.framework}</span>
              <span className="is-strong">{d.narrative.cyber.incident}</span>
            </div>
            <div className="hub-foot-rule">
              <div className="hub-label">Human capital · Item 1</div>
              <div className="hub-cell-mono is-soft">
                {d.narrative.humanCapital.heads} employees · {d.narrative.humanCapital.turnover}{" "}
                {d.narrative.humanCapital.note}
              </div>
            </div>
          </div>

          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Material agreements · 8-K 1.01</span>
              <Src href={L.eightK}>Read the 8-Ks ↗</Src>
            </div>
            {d.narrative.agreements.map((a, i) => (
              <div className="hub-agree-row" key={`${a.t}${i}`}>
                <span className="hub-cell">{a.t}</span>
                <span className="hub-cell-mono is-soft ta-r">{a.date}</span>
              </div>
            ))}
          </div>

          <div className="p-card">
            <div className="hub-label">Outlook language · 8-K 2.02 exhibit</div>
            <span className="hub-cell">{d.narrative.guidance}</span>
            <div className="hub-note">
              Guidance is a furnished exhibit, not audited — tracked for language change only.
            </div>
          </div>
        </div>
      </section>

      {tray.length > 0 && trayOpen && (
        <ComparisonTray
          T={T}
          ids={tray}
          setIds={setTray}
          onHide={() => setTrayOpen(false)}
          range={range}
          basis={basis}
          onOpenHistory={() => navigate(sel.href(`/company/${T}/history`))}
        />
      )}
    </div>
  );
}

/**
 * One financial-snapshot tile: the level, its trailing-8-quarter shape, and the YoY move.
 *
 * The spark carries no axis on purpose — it is there to show whether the level arrived smoothly
 * or jumped, and a reader who needs the numbers opens the tile. The YoY arrow is direction only;
 * nothing here is coloured by whether the move is welcome.
 */
function SnapTile({
  m, open, onOpen, inTray, onTray,
}: {
  m: SnapshotTile;
  open: boolean;
  onOpen: () => void;
  inTray: boolean;
  onTray: () => void;
}) {
  const trackable = !!LABEL_TO_ID[m.label];
  return (
    <div
      className={`hub-snap${open ? " is-open" : ""}${trackable ? " is-clickable" : ""}`}
      onClick={() => trackable && onOpen()}
    >
      <span className="hub-snap-label">{m.label}</span>
      <span className={`hub-snap-value${trackable ? " hub-cue" : ""}`} title={m.reason}>
        {m.value === "N/A" ? <StatusChip status="na" /> : m.value}
      </span>
      {/* A one-point or empty series draws a flat line, which reads as "no change" rather than
          "nothing to draw". Better to show no chart than a chart that says something false. */}
      <div className="hub-snap-spark">
        {m.spark.length > 1 ? (
          <Sparkline points={m.spark.map((v, i) => ({ period: String(i), value: v }))} height={24} />
        ) : null}
      </div>
      <span className="hub-snap-yoy">{m.yoy}</span>
      {trackable && (
        <button
          type="button"
          className={`hub-tray-add${inTray ? " is-in" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onTray();
          }}
        >
          {inTray ? "− in tray" : "+ compare"}
        </button>
      )}
    </div>
  );
}

const RANGE_TABS = [
  ["8q", "8 quarters"],
  ["20q", "20 quarters"],
  ["5y", "5 fiscal years"],
] as const;

const BASIS_TABS = [
  ["filed", "As filed"],
  ["restated", "As restated"],
] as const;

/**
 * The inline trend a statement row opens into.
 *
 * Two axis controls that are NOT the same kind of thing: `range` is a window; `basis` is which
 * version of the fact you are looking at. A restatement moves one quarter and leaves the rest
 * identical, which is exactly what switching basis should show.
 */
function TrendDrawer({
  T, id, range, setRange, basis, setBasis,
}: {
  T: string;
  id: string;
  range: "8q" | "20q" | "5y";
  setRange: (r: "8q" | "20q" | "5y") => void;
  basis: "filed" | "restated";
  setBasis: (b: "filed" | "restated") => void;
}) {
  // Fetched ON INTERACTION, not with the page: the drawer only exists once a row is opened, and
  // its window/basis controls refetch. That is why the series has its own seam function rather
  // than riding `companyFinancials` — see `data/api.ts`.
  const res = useApi(() => api.companyMetricSeries(T, id, range, basis), [T, id, range, basis]);
  if (res.error) return <StateBlock variant="error" copy={res.error.message} />;
  if (!res.data) return <StateBlock variant="loading" copy="Reading this metric's history." />;
  const s = res.data.series;
  // A metric with no series is a structural absence, not a failure — the row simply has nothing
  // to open. Rendering nothing is right; rendering an empty chart would imply a measured zero.
  if (!s) return null;
  const shown = s.vals.filter((v): v is number => v != null);
  const fmt = unitFmt(s.unit, shown[shown.length - 1]);
  const latest = shown.length ? fmt(shown[shown.length - 1]) : "not disclosed";
  const change =
    shown.length > 1 ? `${shown[shown.length - 1] - shown[0] >= 0 ? "↑" : "↓"} ${fmt(Math.abs(shown[shown.length - 1] - shown[0]))} over the window` : "";
  const gaps = s.vals.filter((v) => v == null).length;

  return (
    <div className="hub-drawer">
      <div className="hub-drawer-head">
        <div className="hub-drawer-title">
          <span className="hub-panel-title is-sm">{s.label}</span>
          <span className="hub-cell-mono">{latest}</span>
          <span className="hub-cell-mono is-soft">{change}</span>
        </div>
        <div className="hub-tabs is-sm">
          {RANGE_TABS.map(([k, l]) => (
            <button key={k} type="button" className={`hub-tab is-sm${range === k ? " is-active" : ""}`} onClick={() => setRange(k)}>
              {l}
            </button>
          ))}
          <span className="hub-tab-sep" />
          {BASIS_TABS.map(([k, l]) => (
            <button key={k} type="button" className={`hub-tab is-sm${basis === k ? " is-active" : ""}`} onClick={() => setBasis(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <SeriesChart
        series={[{ id, label: s.label, kind: "focal", points: s.labels.map((p, i) => ({ period: p, value: s.vals[i] })) }]}
        format={fmt}
        area
        height={170}
        label={`${s.label} over ${range}`}
      />
      <div className="hub-drawer-notes">
        <span>
          {gaps
            ? `${gaps} period${gaps > 1 ? "s" : ""} not disclosed — line breaks rather than interpolates`
            : "Disclosed in every period shown"}
        </span>
        <span>
          {basis === "restated"
            ? "Amended figures where a filer restated; otherwise identical to as-filed."
            : "Values as originally filed — not adjusted for later amendments."}
        </span>
        {s.events.length > 0 && <span>Dashed markers: filing events that affect comparability.</span>}
      </div>
    </div>
  );
}

/**
 * The comparison tray: metrics pulled from any row, on one axis.
 *
 * Sticky to the bottom because it is a working set, not a section — the reader keeps scrolling
 * the statements while it stays in view. Mixed units share the axis and the caption says so:
 * read shape, not level.
 */
function ComparisonTray({
  T, ids, setIds, onHide, range, basis, onOpenHistory,
}: {
  T: string;
  ids: string[];
  setIds: (f: (x: string[]) => string[]) => void;
  onHide: () => void;
  range: "8q" | "20q" | "5y";
  basis: "filed" | "restated";
  onOpenHistory: () => void;
}) {
  /*
   * One read per tray item, in parallel. `ids` is reader-controlled and varies in length, so it
   * cannot be a hook per metric — the count would change between renders. Fanning out inside a
   * single `useApi` keeps the hook count fixed and matches the operator ruling that the frontend
   * may make as many requests as it needs.
   */
  const res = useApi(
    () => Promise.all(ids.map((id) => api.companyMetricSeries(T, id, range, basis))),
    [T, ids.join("|"), range, basis],
  );
  if (res.error) return <StateBlock variant="error" copy={res.error.message} />;
  if (!res.data) return null; // the tray is an aside; a shimmer pinned to the viewport would nag
  const defs = res.data[0]?.defs ?? [];
  const picked = res.data.map((r) => r.series).filter((s): s is NonNullable<typeof s> => !!s);
  if (!picked.length) return null;
  const units = Array.from(new Set(picked.map((s) => s.unit)));
  const kinds = ["focal", "b", "peer"] as const;

  return (
    <div className="hub-tray">
      <div className="hub-tray-head">
        <div className="hub-tray-items">
          <span className="hub-panel-title is-sm">Comparison chart</span>
          <button type="button" className="hub-nav-link is-inline" onClick={onOpenHistory}>
            Open in Financial history →
          </button>
          {picked.map((s, i) => (
            <span className="hub-tray-chip" key={s.label}>
              <span className={`hub-tray-swatch is-${kinds[i % kinds.length]}`} />
              {s.label}
              <button
                type="button"
                onClick={() => setIds((x) => x.filter((k) => k !== defs.find((d) => d.label === s.label)?.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="hub-tray-actions">
          <button type="button" onClick={() => setIds(() => [])}>Clear</button>
          <button type="button" onClick={onHide}>Hide</button>
        </div>
      </div>
      <SeriesChart
        series={picked.map((s, i) => ({
          id: s.label,
          label: `${s.label} (${s.unit})`,
          kind: kinds[i % kinds.length],
          points: s.labels.map((p, j) => ({ period: p, value: s.vals[j] })),
        }))}
        format={(v) => String(Math.round(v * 10) / 10)}
        legend
        height={200}
        label="Comparison tray"
      />
      <div className="hub-drawer-notes">
        {units.length > 1 && (
          <span>Mixed units ({units.join(", ")}) share one axis — read shape, not level.</span>
        )}
        <span>Metrics stay in the tray while you scroll; open them together in Financial history.</span>
      </div>
    </div>
  );
}

export { HUB_SECTIONS };

/**
 * The hub's right rail: every form this registrant filed, newest first, filterable by form.
 *
 * It sits beside the analytical sections rather than inside them for the same reason the sector
 * altitude's feed does — a filing is an EVENT, and the panels either side of it carry STATE.
 */
export function HubRail() {
  const sel = useSelection();
  // Its own read: the rail rides EVERY hub view, including the four this task does not touch, so
  // it cannot depend on the Overview's payload. Phase A: `/filing-index` — one walk, several
  // consumers (this rail, §05.1, §06.4–6.6, §08.4/8.6).
  const res = useApi(() => api.companyFilingEvents(sel.focal), [sel.focal]);
  const [filter, setFilter] = useState("all");

  if (res.error) return <StateBlock variant="error" copy={res.error.message} />;
  if (!res.data) return <StateBlock variant="loading" copy="Reading this filer's filing index." />;
  const timeline = res.data.timeline;

  const forms = ["all", ...Array.from(new Set(timeline.map((e) => e.form)))];
  const rows = filter === "all" ? timeline : timeline.filter((e) => e.form === filter);

  return (
    <div className="rail-card">
      <div className="rail-label">Filing timeline</div>
      <div className="hub-hint hub-mb-sm">
        every form as filed · {rows.length} of {timeline.length} filings shown
      </div>
      <div className="hub-tl-filters">
        {forms.map((f) => (
          <button
            key={f}
            type="button"
            className={`hub-tl-filter${filter === f ? " is-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All forms" : f}
          </button>
        ))}
      </div>
      {rows.map((e) => (
        <div className="hub-tl-row" key={`${e.date}${e.form}${e.desc}`}>
          <span className="hub-tl-dot" />
          <div className="hub-tl-body">
            <span className="hub-tl-date">{e.date}</span>
            <span className="hub-tl-form">{e.form}</span>
            <span className="hub-tl-desc">{e.desc}</span>
          </div>
        </div>
      ))}
      <div className="hub-tl-foot">
        Charts in sections 02 and 09 mark the events that affect comparability.
      </div>
    </div>
  );
}
