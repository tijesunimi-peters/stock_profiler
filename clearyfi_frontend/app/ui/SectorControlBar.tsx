/**
 * The persistent sector control bar, ported from the prototype.
 *
 * Row 1: the `Sector` label and the pin-to-compare button, opposed.
 * Row 2: the sector dropdown (button + checked menu).
 * Row 3: sub-industry pills.
 * Row 4, over a rule: peer count · period · coverage (with an accent dot), then the four-token
 * status legend pushed right.
 */
import { useEffect, useRef, useState } from "react";
import { SECTOR_NAMES, SUB_NAMES, AS_OF, COVERAGE_LABEL } from "../data/prototype";
import { useSelection } from "../state";
import { navigate } from "../router";

export function SectorControlBar({ peerCount }: { peerCount: number }) {
  const sel = useSelection();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pinned = sel.compareA === sel.sectorIdx || sel.compareB === sel.sectorIdx;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="ctrlbar" ref={ref}>
      <div className="ctrlbar-top">
        <span className="ctrlbar-label">Sector</span>
        <button
          type="button"
          className={`pin-btn${pinned ? " is-pinned" : ""}`}
          onClick={() => {
            sel.set({ compareA: sel.sectorIdx });
            navigate(sel.href("/compare/sectors", { compareA: sel.sectorIdx }));
          }}
        >
          {pinned ? "✓ pinned to compare" : "+ pin to compare"}
        </button>
      </div>

      <div className="sector-select">
        <button
          type="button"
          className="sector-select-btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span>{SECTOR_NAMES[sel.sectorIdx]}</span>
          <span className={`sector-select-caret${open ? " is-open" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="sector-menu" role="listbox">
            {SECTOR_NAMES.map((name, i) => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={i === sel.sectorIdx}
                className={`sector-menu-item${i === sel.sectorIdx ? " is-active" : ""}`}
                onClick={() => {
                  // Selecting a sector changes the SUBJECT of the current view and keeps the
                  // metric focus; the sub-industry clears because it belonged to the old peer set.
                  sel.set({ sectorIdx: i, subIdx: -1 });
                  setOpen(false);
                }}
              >
                <span>{name}</span>
                {i === sel.sectorIdx && <span className="sector-menu-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ctrlbar-subs">
        <span className="ctrlbar-label">Sub-industry</span>
        {SUB_NAMES.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`sub-pill${sel.subIdx === i ? " is-active" : ""}`}
            onClick={() => sel.set({ subIdx: sel.subIdx === i ? -1 : i })}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="ctrlbar-meta">
        <span>{peerCount} filers</span>
        <span>{AS_OF}</span>
        <span className="ctrlbar-cov">
          <i />
          {COVERAGE_LABEL}
        </span>
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
