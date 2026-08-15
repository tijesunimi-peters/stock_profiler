/**
 * The persistent sector control bar, on the real SIC 2-digit vocabulary.
 *
 * Row 1: the `Sector` label and the peer basis.
 * Row 2: the sector dropdown (button + checked menu), 59 real groups from `/v1/sectors`.
 * Row 3, over a rule: peer count · period, then the four-token status legend pushed right.
 *
 * **Two of the prototype's controls are gone, and the reasons are different.**
 *
 * *Sub-industry pills* — there is no sub-industry. The six names and their filer counts (14, 9,
 * 17…) came from nothing, and at SIC 2-digit no finer peer set is materialized. A dead control is
 * worse than none: a reader who clicks it learns that the site's filters do not work.
 *
 * *Pin to compare* — the compare surface is still entirely synthetic and its sectors are the
 * prototype's eleven invented ones. Pinning a real SIC group into that comparison would produce
 * the exact mixture `PROVENANCE.partialSurfaces` exists to warn about: two panels that look the
 * same where one is a filing and the other is a hash. It comes back with the compare port.
 *
 * The coverage chip ("94% filed") went for the plainest reason — it was a literal in
 * `prototype.ts` and nothing measures it.
 */
import { useEffect, useRef, useState } from "react";
import { useSelection } from "../state";
import { useSectorRoster } from "../lib/useSectorRoster";

export function SectorControlBar() {
  const sel = useSelection();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { roster, label, peerCount } = useSectorRoster();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filers = peerCount(sel.sectorGroup);

  return (
    <div className="ctrlbar" ref={ref}>
      <div className="ctrlbar-top">
        <span className="ctrlbar-label">Sector</span>
        <span className="ctrlbar-basis">{roster?.peerBasis ?? "SIC 2-digit"} · SEC-assigned</span>
      </div>

      <div className="sector-select">
        <button
          type="button"
          className="sector-select-btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!roster}
        >
          <span>
            <b className="sector-code">{sel.sectorGroup}</b> {label(sel.sectorGroup)}
          </span>
          <span className={`sector-select-caret${open ? " is-open" : ""}`}>▾</span>
        </button>
        {open && roster && (
          <div className="sector-menu" role="listbox">
            {roster.groups.map((g) => (
              <button
                key={g.group}
                type="button"
                role="option"
                aria-selected={g.group === sel.sectorGroup}
                className={`sector-menu-item${g.group === sel.sectorGroup ? " is-active" : ""}`}
                onClick={() => {
                  // Selecting a sector changes the SUBJECT of the current view and keeps the
                  // focused theme — the reader stays on the panel they were reading.
                  sel.set({ sectorGroup: g.group });
                  setOpen(false);
                }}
              >
                <span>
                  <b className="sector-code">{g.group}</b> {g.label}
                </span>
                <span className="sector-menu-count">{g.peerCount}</span>
                {g.group === sel.sectorGroup && <span className="sector-menu-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ctrlbar-meta">
        {/* `?? 0` is banned in the seam and the same rule holds here: no count is not zero filers. */}
        <span>{filers == null ? "filers N/A" : `${filers} filers`}</span>
        <span>{roster ? `FY ${roster.fiscalYear}` : "—"}</span>
        <span className="ctrlbar-spacer" />
        <span className="legend-chips">
          <span className="lc lc-ok">● OK</span>
          <span className="lc lc-approx">≈ APPROX</span>
          <span className="lc lc-na">∅ N/A</span>
          <span className="lc lc-nm">~ N/M</span>
        </span>
      </div>
    </div>
  );
}
