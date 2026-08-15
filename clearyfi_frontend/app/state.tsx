/**
 * The single selection store, matching the prototype's own state shape (HANDOFF §6):
 * `{ view, sectorGroup, subIdx, expanded, decomp, drillScope, focal, manager, compareA, compareB }`.
 *
 * `sectorGroup` was `sectorIdx` until the sector port: the prototype indexed a list of invented
 * sector names, and the real identity is the SIC code EDGAR assigns. See the field's own note.
 *
 * Two properties are load-bearing:
 *
 *  1. **Selection persists across every view AND across routes.** Under the split-by-altitude
 *     resolution the surfaces are separate pages, so the state rides in the query string —
 *     losing it on navigation is the primary cause of the "lost my place" feeling (00 §7).
 *  2. **Selection changes the SUBJECT of the current view, never the view itself** (00 §11.2).
 *     Reading the accruals detail for sector A and picking sector B lands on the accruals
 *     detail for sector B, not on sector B's page header.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "./router";
import { SUB_NAMES } from "./data/prototype";

export interface Selection {
  /**
   * The SIC 2-digit major group, as EDGAR writes it — `"36"`, `"73"`, `"28"`. A CODE, not an
   * index (operator ruling 2026-08-14).
   *
   * It used to index a hand-written `SECTOR_NAMES` of eleven invented sectors, which meant the URL
   * `?sector=3` named a different industry the moment that list was reordered. The code is the
   * identity the API is keyed on, so a link survives any change to how the list is presented.
   *
   * A string because `"01"` and `"07"` are real groups and a number would eat the leading zero.
   * NOT validated against a list here: the roster is fetched, so an unknown code reaches the
   * view and renders as a named empty state rather than being silently rewritten to another
   * sector's page.
   */
  sectorGroup: string;
  /**
   * ⚠️ Vestigial: index into `SUB_NAMES`, or `-1`.
   *
   * There is no sub-industry at SIC 2-digit — the prototype's six pills and their filer counts had
   * no source, and no finer peer set is materialized. Kept only so an old link carrying `?sub=`
   * still parses; nothing reads it. Delete when the compare surface stops being synthetic.
   */
  subIdx: number;
  /**
   * The scorecard tile in focus — drives decomposition, dispersion and the peer strip.
   *
   * A plain string: theme identity is the API's (`normalize/themes.py` owns the list and
   * `/sectors/theme-scores` returns it), so a closed union here would have to be kept in sync by
   * hand and would reject a theme the server added. A URL naming a theme the payload does not
   * carry focuses the first one it does, rather than rendering nothing.
   */
  expanded: string;
  /**
   * The theme whose decomposition panel is open, or `null`.
   *
   * Opens on the focused theme by default — a score that ships without a visible decomposition
   * is exactly the opaque number the honesty rules exist to prevent (00 §9a).
   */
  decomp: string | null;
  /** `theme` | `all` — the dispersion scope toggle. */
  drillScope: "theme" | "all";
  /** Focal company ticker. */
  focal: string;
  /** Focal 13F filer. */
  managerCik: number;
  compareA: number;
  compareB: number;
  compareX: string;
  compareY: string;
  /**
   * Which "beyond the financials" group the Peer-relative view is showing.
   *
   * A selection rather than component state: it belongs in the URL for the same reason the
   * focused theme does — a reader who links someone to the ownership comparison should not
   * land them on disclosure behaviour.
   */
  pxGroup: string;
}

export interface SelectionApi extends Selection {
  set: (patch: Partial<Selection>) => void;
  /** A link to `path` that carries the whole selection with it. */
  href: (path: string, overrides?: Partial<Selection>) => string;
  /**
   * ⚠️ DEPRECATED shims — no view reads these any more (P0b). Do not add a new caller.
   *
   * They stood in for state the ported views do not carry. Every view now reads through
   * `data/api.ts`, so nothing here is load-bearing. `sectorId` (the prototype's `"semis"` /
   * `"pharma"` catalog ids) went with the sector port — SIC groups have no such vocabulary.
   *
   * Kept rather than deleted (operator, 2026-08-02) because `period` is the honest record of a
   * problem Phase A has to solve: it is pinned to "2026-Q1" and the real API speaks THREE period
   * vocabularies — a `(year, FiscalPeriod)` pair for facts, a 13F quarter-end date, and a
   * lookback count. Deleting the constant would delete the reminder that no real period state
   * exists yet.
   */
  period: string;
  subIndustry: string | null;
  focalTicker: string;
}

const KEYS: Record<keyof Selection, string> = {
  sectorGroup: "sector",
  subIdx: "sub",
  expanded: "theme",
  decomp: "decomp",
  drillScope: "scope",
  focal: "focal",
  managerCik: "manager",
  compareA: "a",
  compareB: "b",
  compareX: "x",
  compareY: "y",
  pxGroup: "px",
};

const NUMERIC: (keyof Selection)[] = ["subIdx", "managerCik", "compareA", "compareB"];

const DEFAULTS: Selection = {
  /*
   * SIC 36 — Electronic & Other Electrical Equipment. The nearest real group to the prototype's
   * opening "Semiconductors", and honestly not the same thing: semiconductors are about a third
   * of it. It is a default, not a claim; the control bar names what the group actually is.
   */
  sectorGroup: "36",
  subIdx: -1,
  // The prototype opens on Growth, which is also the spec's suggested default.
  expanded: "growth",
  decomp: "growth",
  drillScope: "theme",
  focal: "NVDA",
  managerCik: 102909,
  compareA: 0,
  compareB: 1,
  compareX: "NVDA",
  compareY: "AMD",
  pxGroup: "disclosure",
};

const STORAGE = "clearyfi:selection";

function stored(): Partial<Selection> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE) ?? "{}");
  } catch {
    return {};
  }
}

const Ctx = createContext<SelectionApi | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const { path, query } = useLocation();

  /**
   * `/company/:symbol/...` names the registrant in the PATH, and the path wins.
   *
   * Without this the path segment and `?focal=` could disagree — `/company/AAPL/hub` would
   * render whatever the query string last remembered — and a page whose URL names one filer
   * while its figures describe another is the one failure mode a data product cannot have.
   */
  const pathFocal = useMemo(() => {
    const m = /^\/company\/([^/]+)/.exec(path);
    return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  }, [path]);

  const selection = useMemo<Selection>(() => {
    const from = stored();
    const get = <K extends keyof Selection>(k: K): Selection[K] => {
      const q = query.get(KEYS[k]);
      const raw = q ?? (from[k] as any) ?? DEFAULTS[k];
      if (NUMERIC.includes(k)) {
        const n = Number(raw);
        return (Number.isFinite(n) ? n : DEFAULTS[k]) as Selection[K];
      }
      if (k === "decomp") return (raw === "null" || raw === "" ? null : raw) as Selection[K];
      return raw as Selection[K];
    };
    const next: Selection = {
      sectorGroup: get("sectorGroup"),
      subIdx: get("subIdx"),
      expanded: get("expanded"),
      decomp: get("decomp"),
      drillScope: get("drillScope"),
      focal: pathFocal ?? get("focal"),
      managerCik: get("managerCik"),
      compareA: get("compareA"),
      compareB: get("compareB"),
      compareX: get("compareX"),
      compareY: get("compareY"),
      pxGroup: get("pxGroup"),
    };
    /*
     * Guard a hand-edited URL, but only where a LOCAL list is the authority.
     *
     * The sector group and the theme id are NOT checked here: both are the API's vocabulary now,
     * and validating them against a copy in the client would mean rewriting `?sector=99` to group
     * 36 and quietly showing a reader a different industry than the link named. An unknown code
     * goes to the view, which fetches, gets nothing back and says so.
     */
    if (!/^\d{1,2}$/.test(next.sectorGroup)) next.sectorGroup = DEFAULTS.sectorGroup;
    if (next.subIdx < -1 || next.subIdx >= SUB_NAMES.length) next.subIdx = -1;
    return next;
  }, [query, pathFocal]);

  const set = useCallback(
    (patch: Partial<Selection>) => {
      const merged = { ...selection, ...patch };
      try {
        sessionStorage.setItem(STORAGE, JSON.stringify(merged));
      } catch {
        /* private mode — the query string still carries it */
      }
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        const key = KEYS[k as keyof Selection];
        if (v == null || v === "") next.delete(key);
        else next.set(key, String(v));
      }
      const qs = next.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      window.dispatchEvent(new Event("cf:navigate"));
    },
    [selection],
  );

  const href = useCallback(
    (path: string, overrides: Partial<Selection> = {}) => {
      const merged = { ...selection, ...overrides };
      const qs = new URLSearchParams();
      for (const [k, key] of Object.entries(KEYS) as [keyof Selection, string][]) {
        const v = merged[k];
        if (v == null || v === "") continue;
        if (v === DEFAULTS[k]) continue; // keep URLs short; defaults are implied
        qs.set(key, String(v));
      }
      const s = qs.toString();
      return `${path}${s ? `?${s}` : ""}`;
    },
    [selection],
  );

  const api = useMemo<SelectionApi>(
    () => ({
      ...selection,
      set,
      href,
      period: "2026-Q1",
      subIndustry: null,
      focalTicker: selection.focal,
    }),
    [selection, set, href],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSelection outside SelectionProvider");
  return v;
}
