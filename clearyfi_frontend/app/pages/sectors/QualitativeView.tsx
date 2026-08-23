/**
 * Altitude 4 — Qualitative disclosures, ported from the prototype's own markup and figures.
 *
 * A 3fr/2fr split (risk-factor themes beside emerging / going-concern / litigation), then the
 * per-filer signal table, then the disclosure landscape.
 *
 * Two things this page does that the numeric altitudes do not, and both are deliberate:
 *
 *  1. **The taxonomy is frozen year over year.** Rising / new / fading are only readable as
 *     disclosure change if the buckets did not move underneath them.
 *  2. **Every count opens.** A filer count the reader cannot expand into names is an assertion;
 *     the tickers behind it are the evidence, and they are one click away.
 */
import { useState } from "react";
import { QUAL_THEMES, dirChip } from "../../data/sector-catalog";
import { api } from "../../data/api";
import type { QualFilerRef } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { StateBlock } from "@ds";
import { GEO_COLORS } from "../../data/sector-catalog";
import { useSectorRoster } from "../../lib/useSectorRoster";
import { useSelection } from "../../state";
import { navigate } from "../../router";

/** The prototype's coverage bar: a 9px track with a single accent fill. */
function CovBar({ pct }: { pct: number }) {
  return (
    <div className="qual-cov">
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * A count that opens into the filers behind it.
 *
 * Inherits its parent's size and color so it reads as the number it replaces, not as a control
 * bolted beside one — the affordance is the caret, and it stays quiet until used.
 *
 * `names`, when given, is a REAL filer list from the backend (Track 2 Wave 0's five real fields)
 * and is shown instead of `pickFilers`. Never both: pairing a real count with `pickFilers`'
 * deterministic-fake names would misrepresent a guess as evidence, so a caller either passes real
 * `names` or leaves it undefined and falls back to the existing fixture reveal.
 */
function Reveal({
  id,
  count,
  pickFilers,
  names,
}: {
  id: string;
  count: number;
  /* Passed down rather than imported: the filer list is DATA, and a child reaching straight into
     `qualitative.ts` would give this page a second source for one figure. */
  pickFilers: (id: string, n: number) => readonly string[];
  names?: QualFilerRef[];
}) {
  const [open, setOpen] = useState(false);
  const chips = names ? names.map((f) => f.name ?? `CIK ${f.cik}`) : pickFilers(id, count);
  return (
    <span className="qual-reveal">
      <button
        type="button"
        className={`qual-reveal-btn${open ? " is-open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Show filers"
        aria-expanded={open}
      >
        <span>{count}</span>
        <span className="qual-reveal-cue">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <span className="qual-reveal-chips">
          {chips.map((tk) => (
            <span className="qual-tk" key={tk}>
              {tk}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** A labelled coverage row — used by four of the landscape cards. `cov=null` means no covered
 *  company had a value for this specific measure, shown as N/A rather than a false 0%. */
function CovRow({ label, cov }: { label: string; cov: number | null }) {
  return (
    <div className="qual-covrow">
      <div className="qual-covrow-head">
        <span className="qual-covrow-label">{label}</span>
        <span className="qual-covrow-pct">{cov == null ? "N/A" : `${cov}%`}</span>
      </div>
      <CovBar pct={cov ?? 0} />
    </div>
  );
}

/* Same fiscal key as the sector overview. */
const QUAL_PERIOD = "FY";

export function QualitativeView() {
  const sel = useSelection();
  const [openTheme, setOpenTheme] = useState<string | null>(null);

  /*
   * TWO sources, and they are different in KIND. The roster supplies the filer count and the
   * sector's name — Track 1, from `/v1/sectors`. `sectorQualitative` supplies everything else on
   * this page, almost all of which is Track 2 and will never have an endpoint behind it. Keeping
   * them separate is what lets one be real while the other keeps honest empty states.
   */
  const { label, peerCount: rosterCount } = useSectorRoster();
  const read = useApi(() => api.sectorQualitative(sel.sectorGroup, QUAL_PERIOD), [sel.sectorGroup]);

  if (read.error) {
    return <StateBlock variant="error" copy={read.error.message} />;
  }
  if (!read.data) {
    return <StateBlock variant="loading" copy="Reading this sector's disclosure record." />;
  }

  const {
    themeLang: THEME_LANG, emerging: EMERGING, goingConcern: GOING_CONCERN,
    litigation: LITIGATION, litigationTotal: LITIGATION_TOTAL, signalMatrix: SIGNAL_MATRIX,
    cyber: CYBER, cyberIncidentFilers, cams: CAMS, auditors: AUDITORS,
    auditorChanges: AUDITOR_CHANGES, auditorChangeFilers, auditorTenure: AUDITOR_TENURE,
    rfVolume: RF_VOLUME, nonGaap: NON_GAAP, deficient: DEFICIENT, hcClimate: HC_CLIMATE,
    pickFilers,
  } = read.data;

  // Real, from the roster. `?? 0` is banned here for the same reason it is in the seam: no count
  // is not zero filers, and every figure below is a share OF this number.
  const peerCount = rosterCount(sel.sectorGroup);
  const sector = label(sel.sectorGroup);

  const filingsHref = (theme: string) => {
    const base = sel.href("/sectors/filings");
    return `${base}${base.includes("?") ? "&" : "?"}theme=${encodeURIComponent(theme)}`;
  };
  const openFilings = (theme: string) => (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(filingsHref(theme));
  };

  const rfMax = Math.max(...RF_VOLUME.words);
  const lang = openTheme ? THEME_LANG[openTheme] : null;

  return (
    <div className="qual">
      <div className="qual-masthead">
        <div className="qual-masthead-left">
          <span className="qual-crumb">{sector}</span>
          <span className="qual-sep">›</span>
          <span className="qual-title">Qualitative disclosures</span>
        </div>
        <div className="qual-masthead-right">
          <span className="qual-pill">{peerCount == null ? "filers N/A" : `${peerCount} filers`} · FY25 10-Ks</span>
          <span className="qual-sections">Item 1A · 3 · 1C · MD&amp;A</span>
        </div>
      </div>

      <div className="qual-split">
        {/* ---------------------------------------------------------------- themes */}
        <div className="p-card">
          <div className="qual-card-head">
            <span className="qual-card-title">Risk-factor themes</span>
            <span className="qual-hint">share of filers citing · YoY direction</span>
          </div>

          {QUAL_THEMES.map((q) => {
            const c = dirChip(q.dir);
            const on = openTheme === q.name;
            return (
              <div
                key={q.name}
                className={`qual-theme-row${on ? " is-open" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setOpenTheme((o) => (o === q.name ? null : q.name))}
                onKeyDown={(e) => e.key === "Enter" && setOpenTheme((o) => (o === q.name ? null : q.name))}
              >
                <span className="qual-theme-name">{q.name}</span>
                <div className="qual-theme-cov">
                  <CovBar pct={q.cov} />
                  <span className="qual-theme-pct">{q.cov}%</span>
                </div>
                <span className="qual-theme-right">
                  <span
                    className="qual-chip"
                    style={{ color: c.color, background: c.bg, borderColor: c.border }}
                  >
                    {c.label}
                  </span>
                  <a
                    className="qual-link"
                    href={filingsHref(q.name)}
                    onClick={openFilings(q.name)}
                    title="View filings in ClearyFi"
                  >
                    Filings →
                  </a>
                </span>
              </div>
            );
          })}

          {openTheme && lang && (
            <div className="qual-lang">
              <div className="qual-lang-head">
                <span className="qual-lang-label">Representative language · {openTheme}</span>
                <button type="button" className="qual-close" onClick={() => setOpenTheme(null)}>
                  − close
                </button>
              </div>
              <div className="qual-quote">“{lang.quote}”</div>
              <div className="qual-lang-foot">
                <span className="qual-hint">{lang.src} · verbatim excerpt</span>
                <a className="qual-link" href={filingsHref(openTheme)} onClick={openFilings(openTheme)}>
                  Open filings in ClearyFi →
                </a>
              </div>
            </div>
          )}

          <div className="qual-foot-note">
            Taxonomy frozen year-over-year so rising/new/fading reflect real disclosure change,
            not re-clustering. Click a theme to read representative filing language.
          </div>
        </div>

        {/* ---------------------------------------------------------------- side stack */}
        <div className="qual-side">
          <div className="qual-card is-emerging">
            <div className="qual-side-title is-ext">Emerging this year</div>
            {EMERGING.map((e) => (
              <div className="qual-emerging-row" key={e.title}>
                <div className="qual-emerging-title">{e.title}</div>
                <div className="qual-emerging-meta">
                  <Reveal id={`emg-${e.title}`} count={e.count} pickFilers={pickFilers} />
                  <span>filers · {e.note}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="qual-card is-warn">
            <div className="qual-side-head">
              <span className="qual-side-title">Going-concern watch</span>
              <span className="qual-side-count">2 / {peerCount ?? "N/A"}</span>
            </div>
            {GOING_CONCERN.map((g) => (
              <div className="qual-gc-row" key={g.filer}>
                <span className="qual-gc-filer">{g.filer}</span>
                <span className="qual-hint">{g.nature}</span>
              </div>
            ))}
          </div>

          <div className="qual-card">
            <div className="qual-side-head">
              <span className="qual-side-title">Material litigation</span>
              <span className="qual-side-total">
                <Reveal id="litall" count={LITIGATION_TOTAL} pickFilers={pickFilers} />
              </span>
            </div>
            {LITIGATION.map((l) => (
              <div className="qual-lit-row" key={l.name}>
                <span className="qual-lit-name">{l.name}</span>
                <Reveal id={`lit-${l.name}`} count={l.count} pickFilers={pickFilers} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- signal matrix */}
      <div className="p-card qual-matrix-card">
        <div className="qual-card-head">
          <span className="qual-card-title">Per-filer signals</span>
          <span className="qual-hint">
            flags derived from narrative sections · discrete, not distributions
          </span>
        </div>
        <div className="qual-matrix-head">
          <span>Filer</span>
          <span className="ta-r">Risk factors</span>
          <span className="ta-r">New</span>
          <span className="ta-c">Going concern</span>
          <span className="ta-c">Litigation</span>
        </div>
        {SIGNAL_MATRIX.map((m) => (
          <div className="qual-matrix-row" key={m.filer}>
            <span className="qual-matrix-filer">{m.filer}</span>
            <span className="qual-matrix-num ta-r">{m.rf}</span>
            <span className={`qual-matrix-num ta-r${m.nw > 0 ? " is-new" : " is-none"}`}>
              {m.nw > 0 ? `+${m.nw}` : "—"}
            </span>
            <span className="ta-c">{m.gc ? "●" : "—"}</span>
            <span className="ta-c">{m.lt ? "●" : "—"}</span>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------------- landscape */}
      <div className="qual-landscape-head">
        <span className="qual-landscape-title">Disclosure landscape</span>
        <span className="qual-hint">audit · controls · narrative sections · share of filers</span>
      </div>

      <div className="qual-landscape">
        <div className="p-card">
          <div className="qual-card-head">
            <span className="qual-side-title">Cybersecurity</span>
            <span className="qual-hint-sm">Item 1C · 8-K 1.05</span>
          </div>
          <CovRow label="Item 1C process described" cov={CYBER.adopted} />
          <CovRow label="Board oversight named" cov={CYBER.board} />
          <CovRow label="CISO / mgmt role named" cov={CYBER.ciso} />
          <div className="qual-incident">
            <Reveal id="cyber8k" count={CYBER.incidents8k} pickFilers={pickFilers} names={cyberIncidentFilers} />
            <span>filed 8-K Item 1.05 this year</span>
          </div>
        </div>

        <div className="p-card">
          <div className="qual-card-head">
            <span className="qual-side-title">Critical Audit Matters</span>
            <span className="qual-hint-sm">auditor report</span>
          </div>
          {CAMS.map((c) => (
            <CovRow key={c.name} label={c.name} cov={c.cov} />
          ))}
        </div>

        <div className="p-card">
          <div className="qual-card-head">
            <span className="qual-side-title">Auditor landscape</span>
            <span className="qual-hint-sm">10-K · 8-K 4.01</span>
          </div>
          <div className="qual-auditors">
            {AUDITORS.map((a, i) => (
              <div className="qual-auditor-row" key={a.name}>
                <span className="qual-auditor-name">{a.name}</span>
                <div className="qual-auditor-track">
                  <div
                    style={{ width: `${a.share}%`, background: GEO_COLORS[i % GEO_COLORS.length] }}
                  />
                </div>
                <span className="qual-auditor-pct">{a.share}%</span>
              </div>
            ))}
          </div>
          <div className="qual-auditor-foot">
            <span className="qual-auditor-changes">
              <Reveal id="auditchg" count={AUDITOR_CHANGES} pickFilers={pickFilers} names={auditorChangeFilers} />
              <span>changes (8-K 4.01)</span>
            </span>
            <span>{AUDITOR_TENURE}</span>
          </div>
        </div>

        <div className="p-card">
          <div className="qual-card-head is-tight">
            <span className="qual-side-title">Risk-factor volume</span>
            <span className="qual-hint-sm">Item 1A word count</span>
          </div>
          <div className="qual-rf-head">
            <span className="qual-rf-median">{RF_VOLUME.median}</span>
            <span className="qual-rf-yoy">{RF_VOLUME.yoy}</span>
          </div>
          <div className="qual-rf-bars">
            {RF_VOLUME.words.map((w, i) => (
              <div className="qual-rf-col" key={i}>
                <div
                  className={`qual-rf-bar${i === RF_VOLUME.words.length - 1 ? " is-latest" : ""}`}
                  style={{ height: `${Math.round((w / rfMax) * 44)}px` }}
                />
                <span className="qual-rf-label">FY{20 + i}</span>
              </div>
            ))}
          </div>
          <div className="qual-hint-sm">{RF_VOLUME.netNew}</div>
        </div>

        <div className="p-card">
          <div className="qual-card-head">
            <span className="qual-side-title">Non-GAAP &amp; charges</span>
            <span className="qual-hint-sm">8-K 2.02 · XBRL</span>
          </div>
          <CovRow label="Presents non-GAAP measures" cov={NON_GAAP.nonGaapUse} />
          <CovRow label="Recorded restructuring charge" cov={NON_GAAP.restructuring} />
          <CovRow label="Recorded impairment" cov={NON_GAAP.impairment} />
        </div>

        <div className="p-card is-warn-border">
          <div className="qual-card-head is-tight">
            <span className="qual-side-title">Late &amp; deficient filings</span>
            <span className="qual-hint-sm">12b-25 · Item 9A</span>
          </div>
          {DEFICIENT.map((d) => (
            <div className="qual-def-row" key={d.label}>
              <div>
                <div className="qual-def-label">{d.label}</div>
                <div className="qual-hint-sm">{d.basis}</div>
              </div>
              <span className="qual-def-count">
                <Reveal id={`def-${d.label}`} count={d.count} pickFilers={pickFilers} names={d.filers} />
              </span>
            </div>
          ))}
        </div>

        <div className="p-card qual-hc">
          <div className="qual-card-head">
            <span className="qual-side-title">Human-capital &amp; climate disclosure</span>
            <span className="qual-hint-sm">Item 1 (Business) · voluntary climate</span>
          </div>
          <div className="qual-hc-grid">
            {HC_CLIMATE.map((r) => (
              <div key={r.label}>
                <div className="qual-covrow-head">
                  <span className="qual-covrow-label">{r.label}</span>
                  <span className="qual-hc-pct">{r.cov}%</span>
                </div>
                <CovBar pct={r.cov} />
                <div className="qual-hc-basis">{r.basis}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
