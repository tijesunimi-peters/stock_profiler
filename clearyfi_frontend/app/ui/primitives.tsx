/**
 * The non-d3 indicators (RECONCILIATION §5a).
 *
 * These are percentage-positioned divs with `gap` layout, and porting them to d3 would be a
 * regression: they reflow, wrap and inherit tokens for free. `PresenceMatrix` in particular is
 * a CSS grid of 14px cells and should stay one.
 *
 * None of them map a metric value to a color scale (§3.1). Where direction matters it is
 * carried by a glyph and a number.
 */
import { useState, type ReactNode } from "react";
import { StatusChip } from "@ds";
import type { MetricStatus } from "@ds";
import { ordinal } from "../lib/format";

// ---------------------------------------------------------------------------- proportion bars

export function PctBar({
  value,
  max = 100,
  label,
  right,
  emphasis,
}: {
  value: number;
  max?: number;
  label?: ReactNode;
  right?: ReactNode;
  emphasis?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="pctbar">
      {(label || right) && (
        <div className="pctbar-head">
          <span className="pctbar-label">{label}</span>
          <span className="pctbar-right num">{right}</span>
        </div>
      )}
      <div className="pctbar-track">
        <div
          className={`pctbar-fill${emphasis ? " is-emphasis" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Signed contribution — grows right from a centre line for positive, left for negative. */
export function ContribBar({ value, max }: { value: number; max: number }) {
  const half = Math.max(0, Math.min(50, (Math.abs(value) / (max || 1)) * 50));
  return (
    <div className="contribbar">
      <div className="contribbar-axis" />
      <div
        className="contribbar-fill"
        style={
          value >= 0
            ? { left: "50%", width: `${half}%` }
            : { right: "50%", width: `${half}%`, opacity: 0.55 }
        }
      />
    </div>
  );
}

export function CoverageBar({ pct, note }: { pct: number; note?: string }) {
  return (
    <div className="coverage">
      <div className="coverage-track">
        <div className="coverage-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="coverage-num num">{pct}%</span>
      {note && <span className="coverage-note">{note}</span>}
    </div>
  );
}

export interface StackPart {
  key: string;
  label: string;
  share: number;
}

/** 100% stacked proportion bar. Single-hue ramp: the bands are parts of one whole. */
export function StackedBar({ parts, insideLabelMin = 0.14 }: { parts: StackPart[]; insideLabelMin?: number }) {
  const total = parts.reduce((a, p) => a + p.share, 0) || 1;
  return (
    <div className="stackbar">
      <div className="stackbar-track">
        {parts.map((p, i) => {
          const share = p.share / total;
          return (
            <div
              key={p.key}
              className="stackbar-seg"
              style={{
                width: `${share * 100}%`,
                background: `color-mix(in srgb, var(--accent) ${Math.round(88 - i * (68 / Math.max(1, parts.length - 1)))}%, var(--bg-card))`,
              }}
              title={`${p.label} — ${Math.round(share * 1000) / 10}%`}
            >
              {share >= insideLabelMin && (
                <span className="stackbar-seg-label">{Math.round(share * 100)}%</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="stackbar-legend">
        {parts.map((p, i) => (
          <span key={p.key} className="stackbar-legend-item">
            <i
              style={{
                background: `color-mix(in srgb, var(--accent) ${Math.round(88 - i * (68 / Math.max(1, parts.length - 1)))}%, var(--bg-card))`,
              }}
            />
            {p.label}
            <b className="num">{Math.round((p.share / total) * 1000) / 10}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Buy vs sell split, drawn from a shared centre. Both sides take the same fill — the ratio and
 * the counts carry the reading, not a green/red pair.
 */
export function InsiderBar({ buy, sell }: { buy: number; sell: number }) {
  const total = buy + sell || 1;
  return (
    <div className="insiderbar">
      <div className="insiderbar-track">
        <div className="insiderbar-buy" style={{ width: `${(buy / total) * 100}%` }} />
        <div className="insiderbar-sell" style={{ width: `${(sell / total) * 100}%` }} />
      </div>
      <div className="insiderbar-legend">
        <span>
          <i className="is-buy" /> buyers <b className="num">{buy}</b>
        </span>
        <span>
          <i className="is-sell" /> sellers <b className="num">{sell}</b>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- compare bars

export interface PairRow {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  display: (v: number) => string;
  /** True when a lower number is the favorable one. */
  inverted?: boolean;
  /** Why a side is absent — carried verbatim from the source (RECONCILIATION §3). */
  aReason?: string | null;
  bReason?: string | null;
}

/**
 * Paired comparison bars. True-length always — an inverted metric gets a "lower is better"
 * TEXT marker and never a flipped fill, and no winner is declared (HANDOFF §3.3).
 *
 * A side with no value is omitted from the comparison and labeled, never drawn as zero.
 */
export function PairBars({ rows, aLabel, bLabel }: { rows: PairRow[]; aLabel: string; bLabel: string }) {
  return (
    <div className="pairbars">
      {rows.map((r) => {
        const max = Math.max(Math.abs(r.a ?? 0), Math.abs(r.b ?? 0)) || 1;
        return (
          <div className="pairbars-row" key={r.key}>
            <div className="pairbars-head">
              <span className="pairbars-label">{r.label}</span>
              {r.inverted && <span className="pairbars-inverted">lower is better</span>}
            </div>
            {(
              [
                ["a", r.a, r.aReason, aLabel] as const,
                ["b", r.b, r.bReason, bLabel] as const,
              ]
            ).map(([side, v, reason, name]) => (
              <div className={`pairbars-bar is-${side}`} key={side}>
                <span className="pairbars-name">{name}</span>
                <div className="pairbars-track">
                  {v == null ? (
                    <span className="pairbars-absent">
                      <StatusChip status="na" /> {reason ?? "not tagged by this filer"}
                    </span>
                  ) : (
                    <div className="pairbars-fill" style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
                  )}
                </div>
                <span className="pairbars-value num">{v == null ? "N/A" : r.display(v)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Small-multiple paired dots with mixed units — one axis per panel, because units differ. */
export function MiniPairs({
  panels,
  aLabel,
  bLabel,
}: {
  panels: { key: string; label: string; a: number | null; b: number | null; display: (v: number) => string }[];
  aLabel: string;
  bLabel: string;
}) {
  return (
    <div className="minipairs">
      {panels.map((p) => {
        const both = p.a != null && p.b != null;
        const lo = both ? Math.min(p.a as number, p.b as number) : 0;
        const hi = both ? Math.max(p.a as number, p.b as number) : 1;
        const span = hi - lo || 1;
        const at = (v: number) => 8 + ((v - lo) / span) * 84;
        return (
          <div className="minipairs-panel" key={p.key}>
            <div className="minipairs-label">{p.label}</div>
            {both ? (
              <>
                <div className="minipairs-track">
                  <i className="is-a" style={{ left: `${at(p.a as number)}%` }} />
                  <i className="is-b" style={{ left: `${at(p.b as number)}%` }} />
                </div>
                <div className="minipairs-values num">
                  <span>{p.display(p.a as number)}</span>
                  <span>{p.display(p.b as number)}</span>
                </div>
              </>
            ) : (
              <div className="minipairs-absent">
                <StatusChip status="na" /> not tagged by both filers
              </div>
            )}
          </div>
        );
      })}
      <div className="minipairs-key">
        <span>
          <i className="is-a" /> {aLabel}
        </span>
        <span>
          <i className="is-b" /> {bLabel}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- ladders & matrices

export function LadderRows({
  rows,
}: {
  rows: { key: string; label: string; value: number; display: string; note?: string }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="ladder">
      {rows.map((r) => (
        <div className="ladder-row" key={r.key}>
          <span className="ladder-label">{r.label}</span>
          <div className="ladder-track">
            <div className="ladder-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="ladder-value num">{r.display}</span>
          {r.note && <span className="ladder-note">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}

/** A CSS grid of 14px cells. Presence, not magnitude — so it is a filled/hollow mark, no ramp. */
export function PresenceMatrix({
  rows,
  cols,
  present,
}: {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  present: (rowKey: string, colKey: string) => boolean | null;
}) {
  return (
    <div className="presence">
      <div className="presence-cols">
        <span />
        {cols.map((c) => (
          <span key={c.key} className="presence-col">
            {c.label}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div className="presence-row" key={r.key}>
          <span className="presence-rowlabel">{r.label}</span>
          {cols.map((c) => {
            const p = present(r.key, c.key);
            return (
              <span
                key={c.key}
                className={`presence-cell${p === true ? " is-on" : p === null ? " is-unknown" : ""}`}
                title={`${r.label} · ${c.label} — ${p === true ? "disclosed" : p === null ? "not covered" : "not disclosed"}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------- reveal

/**
 * Every filer count is click-to-reveal (HANDOFF §5.4). A number the reader cannot open is an
 * assertion; the tickers behind it are the evidence.
 */
export function FilerReveal({
  count,
  tickers,
  noun = "filers",
}: {
  count: number;
  tickers: string[];
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="reveal">
      <button type="button" className="reveal-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="num">{count}</span> {noun}
        <span className="reveal-cue">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <span className="reveal-list">
          {tickers.length ? (
            tickers.map((t) => (
              <span className="reveal-tick" key={t}>
                {t}
              </span>
            ))
          ) : (
            <span className="reveal-empty">no filers behind this count in the indexed window</span>
          )}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------- rank badge

/**
 * `68 · 3rd of 11` — the companion to every score (00 §3a). Because only one sector is on
 * screen, the badge is what tells the reader whether 68 is good; it is not decoration.
 */
export function RankBadge({
  rank,
  of,
  basis = "sectors",
}: {
  rank: number;
  of: number;
  basis?: string;
}) {
  return (
    <span className="rankbadge">
      {ordinal(rank)} of {of} {basis}
    </span>
  );
}

/** A row label with its status chip — used wherever a derived value needs its flag inline. */
export function Flagged({ status, children }: { status: MetricStatus; children: ReactNode }) {
  return (
    <span className="flagged">
      {children}
      <StatusChip status={status} glyphOnly />
    </span>
  );
}
