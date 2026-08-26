/**
 * Company Hub → Insider activity, on real Forms 3/4/5.
 *
 * EVERY surface on this view reads ONE shared Section 16 ledger, so the tiles, the disposition
 * split, the code mix, the per-person rollup and the latency histogram cannot disagree. That is
 * enforced in `data/api.ts`'s `toInsiderActivity` by construction: one `/insider-trades` read,
 * one set of exclusions, nothing below draws a second sample.
 *
 * The page's whole argument is in the split between what a filer DECIDED and what merely
 * HAPPENED to their holdings. Codes P and S are decisions; A, M and F are the mechanical
 * consequences of a grant or a vesting date, and folding them into one "net insider buying"
 * figure is the most common way this data is misread.
 */
import { useState } from "react";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { paginate } from "../../lib/paginate";
import { Pager, StateBlock } from "@ds";
import { Histogram } from "../../charts/bars";
import { PeerStrip } from "../../charts/strips";
import { DotCalendar } from "../../charts/misc";
import { useSelection } from "../../state";

/** A link out to the form the panel reads. */
function Src({ href, children }: { href: string; children: string }) {
  return (
    <a className="hub-src-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/*
 * The window this view reads, in FILINGS — not days.
 *
 * `/insider-trades` and `/insider-summary` are both bounded by filing count, and the two must be
 * given the SAME bound or the ledger and the tally describe different sets. Forty filings is six
 * days at one filer and eight months at another, which is why the masthead prints the span the
 * filings turned out to cover instead of a promised window. A third period vocabulary, and
 * deliberately not conflated with the fiscal pair or the 13F quarter-end.
 */
const INSIDER_WINDOW_FILINGS = 40;

export function InsiderView() {
  const sel = useSelection();
  const T = sel.focal;
  const res = useApi(() => api.companyInsiderActivity(T, INSIDER_WINDOW_FILINGS), [T]);
  // Above the early returns below: a hook must run on every render.
  const [ledgerPage, setLedgerPage] = useState(0);

  if (res.error) return <StateBlock variant="error" copy={res.error.message} />;
  if (!res.data) return <StateBlock variant="loading" copy="Reading this filer's Section 16 filings." />;
  const d = res.data.ledger;
  if (!d.ok) return <StateBlock variant="empty" copy={d.reason ?? "No Section 16 filings read."} />;

  // The ledger is unbounded on real data — a busy filer reports thousands of Form 4 rows, and
  // rendering every one built a DOM to match. Paging is display-only: the counts and charts
  // above still describe all `d.rows`.
  const ledger = paginate(d.rows, ledgerPage);

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
            <span className="hub-hint">open-market shares, −1 to +1</span>
          </div>
          {/* Two clusters, not a spread — see `toInsiderPeerRatio`. The cloud variant is the
              honest mark here: a box would draw its whole interquartile range as a line on the
              floor, because for most groups the 25th, 50th and 75th percentiles are all −1.
              Dots are deliberately NOT clickable (operator, 2026-08-11): navigating away from a
              distribution by clicking one of its points read as confusing rather than useful.
              `PeerStrip` drops its click handler and its pointer cursor when `onPick` is absent,
              so this is inert rather than dead-clicking. */}
          {d.ratio.ok ? (
            <>
              <PeerStrip
                variant="cloud"
                peers={d.ratio.peers}
                marks={
                  d.ratio.focal === null
                    ? []
                    : [{ id: "foc", label: T, value: d.ratio.focal, kind: "focal" }]
                }
                quantiles={
                  d.ratio.quantiles
                    ? {
                        lo: d.ratio.quantiles.min, hi: d.ratio.quantiles.max,
                        q1: d.ratio.quantiles.p25, q3: d.ratio.quantiles.p75,
                        med: d.ratio.quantiles.median,
                      }
                    : undefined
                }
                format={(v) => v.toFixed(2)}
                axisLabels={false}
                label="Open-market insider net-acquisition ratio across the peer set"
              />
              {d.ratio.focalNote ? (
                <div className="hub-note">{d.ratio.focalNote}</div>
              ) : null}
              <div className="hub-note">{d.ratio.note}</div>
            </>
          ) : (
            <StateBlock variant="empty" copy={d.ratio.note} />
          )}
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
          <span className="hub-hint">
            {d.rows.length} transaction rows · newest first
          </span>
        </div>
        <div className="ia-ledger-head">
          <span>Person &amp; plan</span>
          <span>Code</span>
          <span className="ta-r">Shares</span>
          <span className="ta-r">Filed</span>
          <span className="ta-r">Lag</span>
        </div>
        {ledger.slice.map((r, i) => (
          <div className="ia-ledger-row" key={`${r.person}${r.fDate}${ledger.start + i}`}>
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
        <Pager
          page={ledger.page}
          pageCount={ledger.pageCount}
          rangeLabel={ledger.rangeLabel}
          onPrev={() => setLedgerPage(ledger.page - 1)}
          onNext={() => setLedgerPage(ledger.page + 1)}
        />
        <div className="hub-note">
          Transaction date and filing date are both on the form; latency is the gap in business
          days, and is shown only for Form 4, whose deadline is two business days. Codes are the
          filer’s own Table I entries, not our classification.
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
        {/* Every dot is one notice, and every dot is the SAME SIZE — deliberately. We index that
            a Form 144 was filed and on what date; the share count and the broker are its
            contents, which we do not parse. A size-varying dot would claim a magnitude we do not
            have. What remains is real and worth seeing: the cadence of proposed sales. */}
        {d.f144.ok ? (
          <>
            <DotCalendar
              notices={d.f144.notices.map((n, i) => ({
                id: `${n.accession}-${i}`,
                date: n.date,
                size: 1,
                label: `${n.form} filed ${n.date}`,
                filled: true,
              }))}
              magnitude={false}
              height={200}
              label="Form 144 notices of proposed sale, by filing date"
            />
            <div className="hub-note">{d.f144.note}</div>
            {d.f144.truncated ? (
              <div className="hub-note">
                Bounded to the most recent notices read; older ones in the window are not drawn.
              </div>
            ) : null}
          </>
        ) : (
          <StateBlock variant="empty" copy={d.f144.note} />
        )}
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
