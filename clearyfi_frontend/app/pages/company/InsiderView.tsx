/**
 * Company Hub → Insider activity, ported from the prototype.
 *
 * EVERY surface on this view reads ONE shared Section 16 ledger, so the tiles, the disposition
 * split, the code mix, the per-person rollup and the latency histogram cannot disagree. That is
 * enforced in `data/insider.ts` by construction: nothing below draws a second sample.
 *
 * The page's whole argument is in the split between what a filer DECIDED and what merely
 * HAPPENED to their holdings. Codes P and S are decisions; A, M and F are the mechanical
 * consequences of a grant or a vesting date, and folding them into one "net insider buying"
 * figure is the most common way this data is misread.
 */
import { insiderData } from "../../data/insider";
import { Histogram } from "../../charts/bars";
import { DotCalendar } from "../../charts/misc";
import { PeerStrip } from "../../charts/strips";
import { useSelection } from "../../state";
import { navigate } from "../../router";

/** A link out to the form the panel reads. */
function Src({ href, children }: { href: string; children: string }) {
  return (
    <a className="hub-src-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function InsiderView() {
  const sel = useSelection();
  const T = sel.focal;
  const d = insiderData(T);

  return (
    <div className="ia">
      <div className="ia-masthead">
        <div className="ia-masthead-left">
          <span className="ia-name">{T}</span>
          <span className="ia-ticker">{T}</span>
          <span className="ia-kicker">Insider activity</span>
        </div>
        <span className="ia-masthead-right">
          <span className="hub-hint">{d.window}</span>
          <Src href={d.links.forms4}>Forms 3/4/5 ↗</Src>
          <Src href={d.links.f144}>Form 144 ↗</Src>
          <Src href={d.links.proxy}>DEF 14A ↗</Src>
        </span>
      </div>

      {/* ---------------------------------------------------------------- tiles */}
      <div className="ia-tiles">
        {d.tiles.map((t) => (
          <div className="ia-tile" key={t.k}>
            <span className="ia-tile-k">{t.k}</span>
            <span className="ia-tile-v">{t.v}</span>
            <span className="ia-tile-sub">{t.sub}</span>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------------- split + ratio */}
      <div className="ia-pair">
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">What the dispositions actually were</span>
            <span className="hub-hint">transaction codes</span>
          </div>
          <div className="ia-splitbar">
            {d.sharesSplit.map((s) => (
              <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />
            ))}
          </div>
          {d.sharesSplit.map((s) => (
            <div className="ia-split-row" key={s.label}>
              <span className="ia-swatch" style={{ background: s.color }} />
              <span className="ia-split-label">{s.label}</span>
              <span className="hub-cell-mono ta-r">{s.shLabel}</span>
              <span className="hub-cell-mono ta-r is-soft">{s.pctLabel}</span>
            </div>
          ))}
          <div className="hub-label ia-mt">Filing count by side</div>
          <div className="ia-sidebar">
            <div style={{ width: `${(d.acqCount / (d.acqCount + d.dispCount)) * 100}%` }} />
            <div
              className="is-out"
              style={{ width: `${(d.dispCount / (d.acqCount + d.dispCount)) * 100}%` }}
            />
          </div>
          <div className="hub-note">{d.splitNote}</div>
        </div>

        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Net-acquisition ratio against the peer set</span>
            <span className="hub-hint">shares in ÷ shares out</span>
          </div>
          <PeerStrip
            variant="cloud"
            peers={d.ratioDist.vals
              .filter((v) => v.ticker !== T)
              .map((v) => ({ id: v.ticker, label: v.ticker, value: v.val }))}
            marks={[{ id: "foc", label: T, value: d.ratioDist.focalVal, kind: "focal" }]}
            quantiles={{
              lo: d.ratioDist.min, hi: d.ratioDist.max,
              q1: d.ratioDist.q1, q3: d.ratioDist.q3, med: d.ratioDist.med,
            }}
            format={(v) => `${v.toFixed(2)}×`}
            axisLabels={false}
            onPick={(id) => navigate(sel.href(`/company/${id}/insider`, { focal: id }))}
            label="Net-acquisition ratio across the peer set"
          />
          <div className="hub-note">{d.ratioNote}</div>
          <div className="hub-label ia-mt">Filing latency</div>
          <Histogram
            bins={d.lagBins}
            median={d.medBd}
            format={(v) => `${Math.round(v)} bd`}
            xLabel="business days from transaction to filing"
            height={175}
            label="Filing latency in business days"
          />
          <div className="hub-note">{d.lagNote}</div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- ledger */}
      <div className="p-card ia-mt-card">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Transaction ledger</span>
          <span className="hub-hint">nine most recent Form 4 filings · newest first</span>
        </div>
        <div className="ia-ledger-head">
          <span>Person &amp; plan</span>
          <span>Code</span>
          <span className="ta-r">Shares</span>
          <span className="ta-r">Filed</span>
          <span className="ta-r">Lag</span>
        </div>
        {d.rows.map((r, i) => (
          <div className="ia-ledger-row" key={`${r.person}${r.fDate}${i}`}>
            <span className="ia-person">
              <span className="ia-person-name">{r.person}</span>
              <span className="ia-person-sub">
                {r.role} · {r.planLabel}
              </span>
            </span>
            <span className="hub-cell-mono">{r.codeShort}</span>
            <span className="hub-cell-mono ta-r">{r.sharesLabel}</span>
            <span className="hub-cell-mono ta-r is-soft">{r.fDate}</span>
            <span className={`hub-cell-mono ta-r${r.lagLate ? " is-late" : " is-soft"}`}>
              {r.lagLabel}
            </span>
          </div>
        ))}
        <div className="hub-note">
          Transaction date and filing date are both on the form; latency is the gap in business
          days. Codes are the issuer’s own Table I entries, not our classification.
        </div>
      </div>

      {/* ---------------------------------------------------------------- people + codes */}
      <div className="ia-pair ia-mt-card">
        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">By person</span>
            <span className="hub-hint">net shares, all codes</span>
          </div>
          {d.people.map((p) => (
            <div className="ia-person-row" key={p.name}>
              <span className="ia-person">
                <span className="ia-person-name">{p.name}</span>
                <span className="ia-person-sub">
                  {p.role} · {p.n} · codes {p.codes}
                </span>
              </span>
              <span className="hub-cell-mono ta-r is-soft">{p.arrow}</span>
              <span className="hub-cell-mono ta-r">{p.netLabel}</span>
            </div>
          ))}
          <div className="hub-note">{d.peopleNote}</div>
        </div>

        <div className="p-card">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Every code, and what it means</span>
            <span className="hub-hint">Form 4 Table I</span>
          </div>
          {d.codeMix.map((c) => (
            <div className="ia-code" key={c.code} style={{ opacity: c.dim }}>
              <div className="ia-code-head">
                <span className="hub-cell-mono">{c.label}</span>
                <span className="hub-cell-mono ta-r">{c.shLabel}</span>
              </div>
              <div className="ia-code-track">
                <div style={{ width: c.w }} />
              </div>
              <div className="ia-code-what">
                {c.what} {c.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- Form 144 */}
      <div className="p-card ia-mt-card">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Notices of proposed sale</span>
          <span className="hub-hint">Form 144 · Rule 10b5-1</span>
        </div>
        <DotCalendar
          notices={d.f144Cal.map((n, i) => ({
            id: `${n.date}-${i}`,
            date: n.date,
            size: n.size,
            label: `${n.person} · ${n.broker}`,
            filled: n.plan,
          }))}
          format={(v) => `${Math.round(v).toLocaleString()} sh`}
          height={200}
          label="Form 144 notices by date and size"
        />
        <div className="hub-note">{d.f144Note}</div>
        <div className="hub-label ia-mt">Most recent notices</div>
        {d.notices.map((n, i) => (
          <div className="ia-notice-row" key={`${n.person}${n.date}${i}`}>
            <span className="ia-person">
              <span className="ia-person-name">{n.person}</span>
              <span className="ia-person-sub">{n.broker}</span>
            </span>
            <span className="hub-cell-mono ta-r">{n.shares}</span>
            <span className="hub-cell-mono ta-r is-soft">{n.date}</span>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------------- forms + limits */}
      <div className="ia-pair ia-mt-card">
        <div className="ia-tintcard">
          <div className="ia-tintcard-title">The forms this view reads</div>
          {d.forms.map((f) => (
            <div className="ia-form-row" key={f.k}>
              <span className="ia-form-k">{f.k}</span>
              <span className="ia-person">
                <span className="ia-form-what">{f.what}</span>
                <span className="ia-person-sub">due {f.when}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="ia-tintcard">
          <div className="ia-tintcard-title">What this cannot tell you</div>
          {d.limits.map((l) => (
            <div className="ia-limit-row" key={l}>
              <span className="ia-limit-dash">—</span>
              <span className="ia-limit-text">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
