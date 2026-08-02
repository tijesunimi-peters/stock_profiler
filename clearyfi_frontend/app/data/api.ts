/**
 * THE SEAM.
 *
 * Every view reads through these functions and nothing else. Today they resolve
 * deterministic-synthetic payloads built in `metrics.ts` / `surfaces.ts`; when the real API is
 * plumbed in, the bodies become `fetch("/v1/…")` calls and no view changes.
 *
 * `?slow` on any URL adds latency so the loading states can be checked without a network.
 */
import * as surfaces from "./surfaces";

const DELAY = () => (typeof location !== "undefined" && location.search.includes("slow") ? 900 : 0);

function resolve<T>(value: T): Promise<T> {
  const ms = DELAY();
  return ms ? new Promise((r) => setTimeout(() => r(value), ms)) : Promise.resolve(value);
}

/** Every payload says where it came from. Today: nowhere real. */
export const PROVENANCE = {
  synthetic: true,
  note: "Deterministic-synthetic figures. No SEC endpoint is being called.",
} as const;

export const api = {
  sector: (sectorId: string, sub: string | null, period: string) =>
    resolve(surfaces.sectorSurface(sectorId, sub, period)),

  qualitative: (sectorId: string, period: string) => resolve(surfaces.qualitativeSurface(sectorId, period)),

  filings: (sectorId: string, themeId: string, period: string) =>
    resolve(surfaces.filingsSurface(sectorId, themeId, period)),

  compareSectors: (a: string, b: string, period: string) => resolve(surfaces.compareSectors(a, b, period)),

  company: (symbol: string, period: string, sub: string | null) =>
    resolve(surfaces.companySurface(symbol, period, sub)),

  companyHistory: (symbol: string, period: string) => resolve(surfaces.companyHistory(symbol, period)),

  companyInstitutional: (symbol: string, period: string) =>
    resolve(surfaces.companyInstitutional(symbol, period)),

  companyInsider: (symbol: string, period: string) => resolve(surfaces.companyInsider(symbol, period)),

  companyPeers: (symbol: string, period: string, sub: string | null) =>
    resolve(surfaces.companyPeers(symbol, period, sub)),

  compareCompanies: (x: string, y: string, period: string) =>
    resolve(surfaces.compareCompanies(x, y, period)),

  manager: (cik: number, period: string) => resolve(surfaces.managerSurface(cik, period)),

  managerFootprint: (cik: number, period: string) => resolve(surfaces.managerFootprint(cik, period)),

  managerVoting: (cik: number, period: string) => resolve(surfaces.managerVoting(cik, period)),

  managerFivePercent: (cik: number, period: string) => resolve(surfaces.managerFivePercent(cik, period)),

  managerActivity: (cik: number, period: string) => resolve(surfaces.managerActivity(cik, period)),

  managerBehaviour: (cik: number, period: string) => resolve(surfaces.managerBehaviour(cik, period)),
};
