/**
 * The on-site theme drill, ported from the prototype.
 *
 * Reached from any risk theme's "Filings →". Every row resolves IN-APP — there is no EDGAR
 * redirect, because handing the reader off to the raw document is exactly the work the product
 * claims to have already done. The excerpt on each row is the passage our taxonomy matched,
 * which is also what makes the match checkable.
 */
import { useEffect, useState } from "react";
import { FILINGS_PER_PAGE, FORM_TABS, QUAL_THEMES } from "../../data/sector-catalog";
import { useSectorRoster } from "../../lib/useSectorRoster";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { StateBlock } from "@ds";
import { useLocation, navigate } from "../../router";
import { useSelection } from "../../state";

export function FilingsView() {
  const sel = useSelection();
  const { query } = useLocation();
  const theme = query.get("theme") ?? QUAL_THEMES[0].name;

  const [form, setForm] = useState<string>(FORM_TABS[0]);
  const [page, setPage] = useState(0);

  // A stale page number after a filter change reads as an empty result rather than as a filter.
  useEffect(() => setPage(0), [theme, form]);

  /*
   * Two sources: the filer count and the sector's name are Track 1 (the roster, off `/v1/sectors`);
   * the filings are the theme's own and are Track 2. `/filing-index` could fill the filing
   * METADATA here — form, date, accession — but not the passage, which is filing text.
   */
  const { label, peerCount: rosterCount } = useSectorRoster();
  const peerCount = rosterCount(sel.sectorGroup);
  const read = useApi(
    () => api.sectorFilings(sel.sectorGroup, theme, peerCount ?? 0),
    [sel.sectorGroup, theme, peerCount],
  );

  if (read.error) {
    return <StateBlock variant="error" copy={read.error.message} />;
  }
  if (!read.data) {
    return <StateBlock variant="loading" copy="Reading filings for this theme." />;
  }
  const d = read.data.filings;

  if (!d) {
    return (
      <div className="p-card">
        <div className="qual-hint">
          No risk theme selected. Open one from the Qualitative view&apos;s &ldquo;Filings
          →&rdquo; link.
        </div>
      </div>
    );
  }

  const rows = form === FORM_TABS[0] ? d.rows : d.rows.filter((r) => r.form === form);
  const pageCount = Math.max(1, Math.ceil(rows.length / FILINGS_PER_PAGE));
  const p = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(p * FILINGS_PER_PAGE, p * FILINGS_PER_PAGE + FILINGS_PER_PAGE);

  return (
    <div className="filings">
      <button
        type="button"
        className="filings-back"
        onClick={() => navigate(sel.href("/sectors/qualitative"))}
      >
        ← back to qualitative
      </button>

      <div className="filings-crumb">
        <span className="qual-crumb">{label(sel.sectorGroup)}</span>
        <span className="qual-sep">›</span>
        <span className="qual-crumb">Risk theme</span>
        <span className="qual-sep">›</span>
        <span className="filings-theme">{d.theme}</span>
      </div>

      <div className="filings-meta">
        <span className="filings-coverage">{d.coverageLabel}</span>
        <span
          className="qual-chip"
          style={{ color: d.dir.color, background: d.dir.bg, borderColor: d.dir.border }}
        >
          {d.dir.label}
        </span>
        <span className="filings-meta-spacer" />
        <span className="filings-count">
          {rows.length} filing{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="filings-lang">
        <div className="qual-lang-label is-muted">Representative language</div>
        <div className="qual-quote">“{d.quote}”</div>
        <div className="qual-hint">{d.src}</div>
      </div>

      <div className="filings-tabs">
        {FORM_TABS.map((f) => (
          <button
            key={f}
            type="button"
            className={`filings-tab${form === f ? " is-active" : ""}`}
            onClick={() => setForm(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="filings-table">
        <div className="filings-head">
          <span>Filer</span>
          <span>Form</span>
          <span>Filed</span>
          <span>Cited passage</span>
        </div>
        {pageRows.map((r) => (
          <a
            className="filings-row"
            key={`${r.ticker}${r.acc}`}
            href={sel.href(`/company/${r.ticker}/overview`)}
          >
            <div>
              <span className="filings-tk">{r.ticker}</span>
              <div className="filings-name">{r.name}</div>
              <div className="filings-acc">{r.acc}</div>
            </div>
            <span className="filings-form" style={{ background: r.formBg, color: r.formColor }}>
              {r.form}
            </span>
            <span className="filings-date">{r.date}</span>
            <div>
              <div className="filings-section">{r.section}</div>
              <div className="filings-snippet">“{r.snippet}”</div>
            </div>
          </a>
        ))}
        {!pageRows.length && (
          <div className="filings-empty">
            No {form} filing matched this theme. That is a fact about the form type, not a gap in
            the index.
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="filings-pager">
          <span className="filings-range">
            {p * FILINGS_PER_PAGE + 1}–{p * FILINGS_PER_PAGE + pageRows.length} of {rows.length}
          </span>
          <div className="filings-pager-btns">
            <button
              type="button"
              className="filings-page"
              disabled={p === 0}
              onClick={() => setPage(Math.max(0, p - 1))}
            >
              ← prev
            </button>
            {Array.from({ length: pageCount }, (_x, i) => (
              <button
                key={i}
                type="button"
                className={`filings-page is-num${i === p ? " is-active" : ""}`}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              className="filings-page"
              disabled={p >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, p + 1))}
            >
              next →
            </button>
          </div>
        </div>
      )}

      <div className="qual-foot-note">
        All filings resolved within ClearyFi from cleaned EDGAR data. Excerpts are the passages
        our taxonomy matched to this theme. Accession numbers link to the parsed filing detail.
      </div>
    </div>
  );
}
