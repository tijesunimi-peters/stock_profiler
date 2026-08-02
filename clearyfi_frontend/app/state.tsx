/**
 * The single selection store, matching the prototype's own state shape (HANDOFF §6):
 * `{ view, sectorIdx, subIdx, expanded, decomp, drillScope, focal, manager, compareA, compareB }`.
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
import { SECTOR_NAMES, SUB_NAMES, THEMES, type ThemeId } from "./data/prototype";

export interface Selection {
  /** Index into `SECTOR_NAMES`. The prototype indexes sectors; so does this. */
  sectorIdx: number;
  /** Index into `SUB_NAMES`, or `-1` for the whole sector. */
  subIdx: number;
  /** The scorecard tile in focus — drives decomposition, dispersion and the peer strip. */
  expanded: ThemeId;
  /**
   * The theme whose decomposition panel is open, or `null`.
   *
   * Opens on the focused theme by default — a score that ships without a visible decomposition
   * is exactly the opaque number the honesty rules exist to prevent (00 §9a).
   */
  decomp: ThemeId | null;
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
   * TEMPORARY compatibility shims for the views still running on the pre-port synthetic
   * catalog. They disappear as each view is rebuilt against the prototype's own data.
   */
  period: string;
  sectorId: string;
  subIndustry: string | null;
  focalTicker: string;
}

/** Maps the prototype's sector index onto the pre-port catalog id. Removed with the shims. */
const LEGACY_SECTOR_IDS = [
  "semis", "software", "hardware", "biotech", "pharma",
  "banks", "retail", "energy", "utilities", "semis", "telecom",
];

const KEYS: Record<keyof Selection, string> = {
  sectorIdx: "sector",
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

const NUMERIC: (keyof Selection)[] = ["sectorIdx", "subIdx", "managerCik", "compareA", "compareB"];

const DEFAULTS: Selection = {
  sectorIdx: 0,
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
      sectorIdx: get("sectorIdx"),
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
    // Guard against a hand-edited URL naming something that does not exist.
    if (next.sectorIdx < 0 || next.sectorIdx >= SECTOR_NAMES.length) next.sectorIdx = 0;
    if (next.subIdx < -1 || next.subIdx >= SUB_NAMES.length) next.subIdx = -1;
    if (!THEMES.some((t) => t.id === next.expanded)) next.expanded = DEFAULTS.expanded;
    if (next.decomp && !THEMES.some((t) => t.id === next.decomp)) next.decomp = null;
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
      sectorId: LEGACY_SECTOR_IDS[selection.sectorIdx] ?? "semis",
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
