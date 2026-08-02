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
import { hubData, HUB_SECTIONS, LABEL_TO_ID, metricDefs, seriesFor, unitFmt } from "../../data/hub";
import { SeriesChart } from "../../charts/series";
import { SECTOR_NAMES } from "../../data/prototype";
import { FILER_BY_SYMBOL } from "../../data/catalog";
import { useSelection } from "../../state";
import { navigate } from "../../router";

/**
 * The hub's section header: mono ordinal, Hanken 800 title, and the SOURCE FORM inline — all
 * on one rule. Narrower than the sector altitude's header because the hub stacks eight of them.
 */
function HubHead({ n, title, src, id }: { n: string; title: string; src: string; id: string }) {
  return (
    <div className="hub-head" id={id}>
      <span className="hub-head-n">{n}</span>
      <span className="hub-head-title">{title}</span>
      <span className="hub-head-src">{src}</span>
    </div>
  );
}

const STMT_TABS = [
  { key: "income", label: "Income" },
  { key: "balance", label: "Balance sheet" },
  { key: "cash", label: "Cash flow" },
] as const;

export function HubOverview() {
  const sel = useSelection();
  const T = sel.focal;
  const d = hubData(T);
  const [stmt, setStmt] = useState<"income" | "balance" | "cash">("income");
  // One open drawer at a time, and one shared range/basis across every drawer — the axis
  // controls belong to the reader's question, not to the row they happened to open it from.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [range, setRange] = useState<"8q" | "20q" | "5y">("8q");
  const [basis, setBasis] = useState<"filed" | "restated">("filed");
  const [tray, setTray] = useState<string[]>([]);
  const [trayOpen, setTrayOpen] = useState(true);

  const sector = SECTOR_NAMES[sel.sectorIdx];

  return (
    <div className="hub">
      {/* breadcrumb */}
      <div className="hub-crumb">
        <span className="hub-crumb-sector">{sector}</span>
        <span className="hub-crumb-sep">›</span>
        <span className="hub-crumb-name">{FILER_BY_SYMBOL[T]?.name ?? T}</span>
        <span className="hub-crumb-ticker">{T}</span>
        <span className="hub-crumb-spacer" />
        <span className="hub-crumb-pill">SIC 3674 · peer set {sector}</span>
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
        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-label">What the company does · 10-K Item 1</div>
            <p className="hub-prose">
              {T} designs and sells semiconductor products across compute, connectivity and
              embedded end markets, selling through distributors and directly to original
              equipment manufacturers. Manufacturing is partly outsourced to third-party foundries
              and assembly and test providers.
            </p>
            <div className="hub-chips">
              {d.segments.map((s) => (
                <span className="hub-chip" key={s.name}>
                  <i style={{ background: s.color }} />
                  {s.name} <b>{s.revW}</b>
                </span>
              ))}
            </div>
          </div>
          <div className="p-card is-tint">
            <div className="hub-label">Registrant profile · cover page</div>
            <div className="hub-profile">
              {[
                ["CIK", String(FILER_BY_SYMBOL[T]?.cik ?? "—").padStart(10, "0")],
                ["Ticker", T],
                ["Exchange", "NASDAQ"],
                ["State of incorporation", d.structure.subs[0].jur],
                ["Fiscal year end", "last Sunday of January"],
                ["Filer status", "Large accelerated"],
                ["SIC", "3674 · Semiconductors"],
                ["Employees", d.narrative.humanCapital.heads],
                ["Auditor", d.audit.firm],
                ["Shell company", "No"],
              ].map(([k, v]) => (
                <div className="hub-profile-cell" key={k}>
                  <span className="hub-profile-k">{k}</span>
                  <span className="hub-profile-v">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-card hub-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Consolidated subsidiaries</span>
            <span className="hub-hint">
              EX-21 · {d.structure.subCount} entities · {d.structure.offshore} organized outside
              the U.S.
            </span>
          </div>
          <div className="hub-table-head hub-subs-grid">
            <span>Entity</span>
            <span>Jurisdiction</span>
            <span className="ta-r">Ownership</span>
          </div>
          {d.structure.subs.map((s) => (
            <div className="hub-subs-grid hub-row" key={s.name}>
              <span className="hub-cell">{s.name}</span>
              <span className="hub-cell-mono">{s.jur}</span>
              <span className="hub-cell-mono ta-r">{s.own}</span>
            </div>
          ))}
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
                  {r.vals.map((v, i) => (
                    <span className="hub-cell-mono ta-r" key={i}>
                      {v}
                    </span>
                  ))}
                </div>
                {isOpen && mid && <TrendDrawer T={T} id={mid} range={range} setRange={setRange} basis={basis} setBasis={setBasis} />}
              </div>
            );
          })}

          <div className="hub-note">Amounts as originally filed.</div>
        </div>

        <div className="hub-divider">Footnote detail — where the explanation usually lives</div>

        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-panel-head">
              <span className="hub-label no-mb">Revenue disaggregation · ASC 606</span>
            </div>
            {d.footnotes.disagg.map((x) => (
              <div className="hub-comp-row" key={x.label}>
                <div className="hub-comp-head">
                  <span className="hub-cell">{x.label}</span>
                  <span className="hub-cell-mono">
                    {x.amt} · {x.pct}
                  </span>
                </div>
                <div className="hub-comp-track">
                  <div style={{ width: x.w }} />
                </div>
              </div>
            ))}
            <div className="hub-kv-row hub-mt-sm">
              <span className="hub-cell">Remaining performance obligations</span>
              <span className="hub-cell-mono">{d.footnotes.rpo.tot}</span>
            </div>
            <div className="hub-note">
              {d.footnotes.rpo.within12} expected to be recognized within 12 months
            </div>
          </div>

          <div className="p-card">
            <div className="hub-label">Inventory composition</div>
            {d.footnotes.inv.map((x) => (
              <div className="hub-tri-row" key={x.label}>
                <span className="hub-cell">{x.label}</span>
                <span className="hub-cell-mono ta-r">{x.amt}</span>
                <span className="hub-cell-mono ta-r is-soft">{x.yoy}</span>
              </div>
            ))}
            <div className="hub-note">
              Work-in-process and finished-goods build-ups are disclosed before any excess reserve
              is recorded — read alongside the excess-and-obsolescence estimate.
            </div>
          </div>

          <div className="p-card">
            <div className="hub-label">Debt maturity ladder</div>
            {d.footnotes.debtLadder.map((x) => (
              <div className="hub-ladder-row" key={x.y}>
                <span className="hub-cell-mono is-soft">{x.y}</span>
                <span className="hub-commit-track">
                  <span style={{ width: x.w }} />
                </span>
                <span className="hub-cell-mono ta-r">{x.amt}</span>
                <span className="hub-cell-mono ta-r is-soft">{x.rate}</span>
              </div>
            ))}
            <div className="hub-note">Covenants: {d.covenant}</div>
          </div>

          <div className="p-card">
            <div className="hub-label">Effective tax rate reconciliation</div>
            {d.footnotes.tax.rows.map((x) => (
              <div className="hub-kv-row" key={x.k}>
                <span className="hub-cell">{x.k}</span>
                <span className="hub-cell-mono">{x.v}</span>
              </div>
            ))}
            <div className="hub-kv-row is-total">
              <span className="hub-cell is-bold">Effective rate</span>
              <span className="hub-cell-mono is-bold">{d.footnotes.tax.eff}</span>
            </div>
            <div className="hub-note">
              Valuation allowance {d.footnotes.tax.va} · unrecognized tax benefits{" "}
              {d.footnotes.tax.utb}
            </div>
          </div>

          <div className="p-card">
            <div className="hub-label">Deferred revenue roll-forward</div>
            {[
              ["Opening balance", d.footnotes.defrev.open],
              ["Billed / deferred", d.footnotes.defrev.billed],
              ["Recognized in revenue", d.footnotes.defrev.rec],
              ["Closing balance", d.footnotes.defrev.close],
            ].map(([k, v]) => (
              <div className="hub-kv-row" key={k}>
                <span className="hub-cell">{k}</span>
                <span className="hub-cell-mono">{v}</span>
              </div>
            ))}
            <div className="hub-foot-rule">
              <div className="hub-label">Allowance for credit losses</div>
              <div className="hub-cell-mono is-soft">
                {d.footnotes.allow.open} opening · +{d.footnotes.allow.prov} provision · −
                {d.footnotes.allow.wo} write-offs · {d.footnotes.allow.close} closing
              </div>
            </div>
          </div>

          <div className="p-card">
            <div className="hub-label">Stock compensation by line item</div>
            {d.footnotes.sbc.lines.map((x) => (
              <div className="hub-comp-row" key={x.label}>
                <div className="hub-comp-head">
                  <span className="hub-cell">{x.label}</span>
                  <span className="hub-cell-mono">{x.amt}</span>
                </div>
                <div className="hub-comp-track">
                  <div style={{ width: x.w }} />
                </div>
              </div>
            ))}
            <div className="hub-note">
              Total {d.footnotes.sbc.tot} · R&amp;D capitalization: {d.footnotes.capR.cap}{" "}
              capitalized vs {d.footnotes.capR.exp} expensed
            </div>
          </div>

          <div className="p-card">
            <div className="hub-label">Goodwill by reporting unit</div>
            {d.footnotes.gwUnits.map((g, i) => (
              <div className="hub-tri-row" key={`${g.name}${i}`}>
                <span className="hub-cell">{g.name}</span>
                <span className="hub-cell-mono ta-r">{g.gw}</span>
                <span className="hub-cell-mono ta-r is-soft">{g.head} headroom</span>
              </div>
            ))}
            <div className="hub-note">
              Leases: {d.footnotes.leases.tot} liability · {d.footnotes.leases.wa}{" "}
              weighted-average term · {d.footnotes.leases.disc} discount rate
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 03 */}
      <section className="hub-sec">
        <HubHead id="s3" n="03" title="Segments & geography" src="ASC 280 · 10-K segment footnote" />
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Reportable segments</span>
            <span className="hub-hint">revenue and operating income as disclosed</span>
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
        </div>

        <div className="hub-grid hub-mt">
          <div className="p-card">
            <div className="hub-label">Long-lived assets by country</div>
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
            <div className="hub-label">Customer concentration · filers must name any customer &gt;10%</div>
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
            <div className="hub-label">Share count roll-forward</div>
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
            <div className="hub-label">Repurchase program</div>
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
            <div className="hub-label">Class structure & voting</div>
            {d.capital.classes.map((c) => (
              <div className="hub-tri-row" key={c.c}>
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
            <div className="hub-label">Reported blockholders · 13D/G</div>
            {d.capital.holders.map((h) => (
              <div className="hub-tri-row" key={h.name}>
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
            <div className="hub-label">Officer & director changes</div>
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
            <div className="hub-label">Board composition</div>
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
            <div className="hub-label">CEO pay mix · summary compensation table</div>
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
        </div>
      </section>

      {/* ============================================================ 06 */}
      <section className="hub-sec">
        <HubHead id="s6" n="06" title="Accounting quality & audit" src="auditor report · Item 9A · 8-K 4.01 / 4.02 · 12b-25" />
        <div className="hub-grid">
          <div className="p-card">
            <div className="hub-label">Auditor</div>
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
            <div className="hub-label">Critical audit matters</div>
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
            <div className="hub-label">Critical accounting estimates</div>
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
            <div className="hub-label">Management-attributed drivers · MD&amp;A</div>
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
            <div className="hub-label">Cybersecurity · Item 1C</div>
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
            <div className="hub-label">Material agreements · 8-K 1.01</div>
            {d.narrative.agreements.map((a, i) => (
              <div className="hub-kv-row" key={`${a.t}${i}`}>
                <span className="hub-cell">{a.t}</span>
                <span className="hub-cell-mono is-soft">{a.date}</span>
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

      {tray.length > 0 && trayOpen && <ComparisonTray T={T} ids={tray} setIds={setTray} onHide={() => setTrayOpen(false)} range={range} basis={basis} />}
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
  const s = seriesFor(T, id, range, basis);
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
  T, ids, setIds, onHide, range, basis,
}: {
  T: string;
  ids: string[];
  setIds: (f: (x: string[]) => string[]) => void;
  onHide: () => void;
  range: "8q" | "20q" | "5y";
  basis: "filed" | "restated";
}) {
  const defs = metricDefs(T);
  const picked = ids.map((id) => seriesFor(T, id, range, basis)).filter((s): s is NonNullable<typeof s> => !!s);
  if (!picked.length) return null;
  const units = Array.from(new Set(picked.map((s) => s.unit)));
  const kinds = ["focal", "b", "peer"] as const;

  return (
    <div className="hub-tray">
      <div className="hub-tray-head">
        <div className="hub-tray-items">
          <span className="hub-panel-title is-sm">Comparison chart</span>
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
  const d = hubData(sel.focal);
  const [filter, setFilter] = useState("all");

  const forms = ["all", ...Array.from(new Set(d.timeline.map((e) => e.form)))];
  const rows = filter === "all" ? d.timeline : d.timeline.filter((e) => e.form === filter);

  return (
    <div className="rail-card">
      <div className="rail-label">Filing timeline</div>
      <div className="hub-hint hub-mb-sm">
        every form as filed · {rows.length} of {d.timeline.length} filings shown
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
