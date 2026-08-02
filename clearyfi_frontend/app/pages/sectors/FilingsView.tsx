/**
 * 05 · Filings view (HANDOFF §5.5) — the on-site theme drill.
 *
 * Reached from any risk theme's "Filings →". Everything resolves IN-APP; there is no EDGAR
 * redirect, because handing the reader off to the raw filing is exactly the work the product
 * claims to have already done.
 */
import { useEffect, useState } from "react";
import { SectionHead, StatusChip, TickerChip } from "@ds";
import type { FilingsSurface } from "../../data/surfaces";
import { humanDate } from "../../lib/format";
import { PctBar } from "../../ui/primitives";
import { useSelection } from "../../state";
import { navigate } from "../../router";

const PAGE = 6;

export function FilingsView({ surface }: { surface: FilingsSurface }) {
  const sel = useSelection();
  const [form, setForm] = useState<"All" | "10-K" | "10-Q" | "8-K">("All");
  const [page, setPage] = useState(0);

  // Reset to the first page whenever the drill changes — a stale page number would look like
  // an empty result.
  useEffect(() => setPage(0), [surface.theme?.id, form]);

  if (!surface.theme) {
    return (
      <div className="panel">
        <p className="panel-note">
          <StatusChip status="na" /> No risk theme selected. Open a theme from the Qualitative
          view's "Filings →" link.
        </p>
      </div>
    );
  }

  const rows = surface.rows.filter((r) => form === "All" || r.form === form);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      <div className="breadcrumb">
        <button type="button" className="linkish" onClick={() => navigate(sel.href("/sectors/qualitative"))}>
          ← {surface.sector.short}
        </button>
        {" › Risk theme › "}
        {surface.theme.label}
      </div>

      <section className="section">
        <SectionHead n="01" title={surface.theme.label} />

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Coverage across the peer set</span>
            <span className="panel-hint">
              {surface.theme.direction} · {surface.theme.deltaPp > 0 ? "+" : ""}
              {surface.theme.deltaPp}pp vs prior year
            </span>
          </div>
          <PctBar
            value={surface.theme.coverage * 100}
            label={`${surface.theme.filers} filers carry this theme`}
            right={`${Math.round(surface.theme.coverage * 100)}%`}
          />
          <div className="quote" style={{ marginTop: 12 }}>
            “{surface.theme.excerpt}”
            <span className="quote-src">{surface.theme.excerptSource}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title="Filings" />

        <div className="panel">
          <div className="panel-head">
            <div className="tag-row">
              {(["All", "10-K", "10-Q", "8-K"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`pill${form === f ? " is-active" : ""}`}
                  onClick={() => setForm(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="panel-hint">newest first</span>
          </div>

          <div className="rows">
            {slice.map((r) => (
              <div className="row" key={r.id}>
                <TickerChip symbol={r.symbol} />
                <div className="row-main">
                  <div className="row-title">{r.name}</div>
                  <div className="row-sub">
                    {r.accession} · {r.section}
                  </div>
                  <p className="metric-row-caption" style={{ marginTop: 6 }}>
                    “{r.passage}”
                  </p>
                </div>
                <span className="form-badge">{r.form}</span>
                <span className="row-num">{humanDate(r.filed)}</span>
              </div>
            ))}
            {!slice.length && (
              <p className="panel-note">
                <StatusChip status="na" /> No {form} filing in the indexed window cites this
                theme. The window is bounded — this is not "none ever".
              </p>
            )}
          </div>

          <div className="pager">
            <button type="button" className="pager-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← prev
            </button>
            {Array.from({ length: pages }, (_x, i) => (
              <button
                key={i}
                type="button"
                className={`pager-btn${i === page ? " is-active" : ""}`}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              className="pager-btn"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              next →
            </button>
            <span className="pager-range">
              {rows.length ? `${page * PAGE + 1}–${Math.min(rows.length, (page + 1) * PAGE)} of ${rows.length}` : "0 of 0"}
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
