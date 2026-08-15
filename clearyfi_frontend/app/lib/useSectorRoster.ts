/**
 * The sector vocabulary, fetched once and shared.
 *
 * Every surface that names an industry — the sector control bar, the company breadcrumbs, the
 * cross-sector strip — has to spell SIC group `"36"` the same way, and the only place that knows
 * how is the API. A second copy in the client is how two panels end up disagreeing about what a
 * sector is called, so there is exactly one and it is not local data.
 *
 * Cached in a module-level promise rather than per-component state: the roster is the app's NAV
 * VOCABULARY, and re-fetching it on every route change would make the sector dropdown flicker
 * between identical answers. A failed fetch clears the cache so the next mount retries — a
 * sticky rejection would leave every industry on the site unnamed until a reload.
 *
 * `label()` falls back to `SIC <code>` rather than to a guess or to an empty string: an unlabelled
 * group is still a real group, and the code is what the URL and the API both call it.
 */
import { useEffect, useState } from "react";
import { api, type SectorRoster } from "../data/api";

let cached: Promise<SectorRoster> | null = null;

function load(): Promise<SectorRoster> {
  if (!cached) {
    cached = api.sectorRoster().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

export interface RosterView {
  roster: SectorRoster | null;
  error: Error | null;
  /** The group's readable name, or `SIC <code>` when the roster has no row for it. */
  label: (group: string) => string;
  /** The group's filer count for the roster's year, or `null` when it has no row. */
  peerCount: (group: string) => number | null;
}

export function useSectorRoster(): RosterView {
  const [roster, setRoster] = useState<SectorRoster | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let live = true;
    load().then(
      (r) => live && setRoster(r),
      (e) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, []);

  return {
    roster,
    error,
    label: (group) => roster?.groups.find((g) => g.group === group)?.label ?? `SIC ${group}`,
    peerCount: (group) => roster?.groups.find((g) => g.group === group)?.peerCount ?? null,
  };
}
