/**
 * `/sectors/:view` — the sector altitude.
 *
 * The rail carries Sector and Qualitative only, as in the prototype: Filings is reached from a
 * risk theme's "Filings →" rather than being a top-level view, and Compare is a subject-scoped
 * ACTION in the sidebar rather than a view. On the Filings drill NEITHER rail button is active,
 * which is the prototype's behaviour and the honest one — the reader is below both.
 *
 * All three views share one right rail: the snapshot and the filing feed describe the sector,
 * not the view, so they do not change when the reader moves between altitudes.
 */
import { STANDARD_DISCLOSURES } from "@ds";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { SectorControlBar } from "../../ui/SectorControlBar";
import { SectorRail, SectorView } from "./SectorView";
import { QualitativeView } from "./QualitativeView";
import { FilingsView } from "./FilingsView";
import { SECTOR_NAMES, SUB_NAMES } from "../../data/sector-catalog";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";

const VIEWS = [
  { value: "sector", label: "Sector" },
  { value: "qualitative", label: "Qualitative" },
];

export function SectorPage({ view }: { view: string }) {
  const sel = useSelection();
  const subActive = sel.subIdx >= 0;
  /*
   * The page needs the filer count for its control bar, which belongs to the PAGE and not to any
   * one view. A filer count is a Track 1 fact from `/sectors`, so it comes through the seam like
   * everything else — falling back to 0 while in flight rather than to a plausible-looking
   * constant, because a wrong count is worse than a briefly blank one.
   */
  const overview = useApi(
    () => api.sectorOverview(String(sel.sectorIdx), subActive ? String(sel.subIdx) : null, "FY"),
    [sel.sectorIdx, subActive, sel.subIdx],
  );
  const peerCount = overview.data
    ? (subActive ? overview.data.subCounts[sel.subIdx] : overview.data.basePeerCount)
    : 0;
  const narrative = view === "qualitative" || view === "filings";

  return (
    <PageShell
      subject="sectors"
      title="Sector analytics"
      subtitle="Built entirely from SEC-filed data · as of latest filing, not real-time"
      right={SECTOR_NAMES[sel.sectorIdx] + (subActive ? ` · ${SUB_NAMES[sel.subIdx]}` : "")}
      controlBar={<SectorControlBar peerCount={peerCount} />}
      views={VIEWS}
      activeView={view}
      onView={(v) => navigate(sel.href(`/sectors/${v}`))}
      railNote="Sector · period · company preserved across views (§7). Selecting a sector keeps your current metric focus."
      railWidth={132}
      contentMax={960}
      rightRail={<SectorRail />}
      disclosures={[
        STANDARD_DISCLOSURES.financials_floor,
        "Composite theme scores are provisional: the rollup method is a placeholder and the weighting is an open decision. They are positions relative to other sectors, not grades.",
        "Percentiles are within the peer set unless labeled 'vs all sectors' — only the composite scorecard compares across sectors.",
        ...(narrative
          ? [
              "Risk themes, going-concern language, CAMs, Item 1C and human-capital figures come from narrative text located by full-text search, not from tagged XBRL facts. They carry parsing risk the numeric views do not.",
              "The filing index covers a bounded recent window. 'None on file' over that window is not 'none ever'.",
            ]
          : []),
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {view === "sector" && <SectorView />}
      {view === "qualitative" && <QualitativeView />}
      {view === "filings" && <FilingsView />}
    </PageShell>
  );
}
