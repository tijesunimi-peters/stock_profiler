/**
 * `/sectors/:view` — the sector altitude.
 *
 * The rail carries Sector and Qualitative only, as in the prototype: Filings is reached from a
 * risk theme's "Filings →" rather than being a top-level view, and Compare is a subject-scoped
 * ACTION in the sidebar rather than a view.
 */
import { STANDARD_DISCLOSURES, StateBlock } from "@ds";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { useLocation, navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { SectorControlBar } from "../../ui/SectorControlBar";
import { SectorRail, SectorView } from "./SectorView";
import { QualitativeRail, QualitativeView } from "./QualitativeView";
import { FilingsView } from "./FilingsView";
import { BASE_PEER_COUNT, SECTOR_NAMES, SUB_COUNTS, SUB_NAMES } from "../../data/prototype";

const VIEWS = [
  { value: "sector", label: "Sector" },
  { value: "qualitative", label: "Qualitative" },
];

export function SectorPage({ view }: { view: string }) {
  const sel = useSelection();
  const { query } = useLocation();
  const riskTheme = query.get("risk") ?? "";
  const subActive = sel.subIdx >= 0;
  const peerCount = subActive ? SUB_COUNTS[sel.subIdx] : BASE_PEER_COUNT;

  const qualitative = useApi(() => api.qualitative(sel.sectorId, sel.period), [sel.sectorId, sel.period]);
  const filings = useApi(() => api.filings(sel.sectorId, riskTheme, sel.period), [
    sel.sectorId,
    riskTheme,
    sel.period,
  ]);
  const active = view === "qualitative" ? qualitative : view === "filings" ? filings : null;

  return (
    <PageShell
      subject="sectors"
      title="Sector analytics"
      subtitle="Built entirely from SEC-filed data · as of latest filing, not real-time"
      right={SECTOR_NAMES[sel.sectorIdx] + (subActive ? ` · ${SUB_NAMES[sel.subIdx]}` : "")}
      controlBar={<SectorControlBar peerCount={peerCount} />}
      views={VIEWS}
      activeView={view === "filings" ? "qualitative" : view}
      onView={(v) => navigate(sel.href(`/sectors/${v}`))}
      railNote="Sector · period · company preserved across views (§7). Selecting a sector keeps your current metric focus."
      railWidth={132}
      contentMax={960}
      rightRail={
        view === "sector" ? (
          <SectorRail />
        ) : view === "qualitative" && qualitative.data ? (
          <QualitativeRail surface={qualitative.data} />
        ) : undefined
      }
      disclosures={[
        STANDARD_DISCLOSURES.financials_floor,
        "Composite theme scores are provisional: the rollup method is a placeholder and the weighting is an open decision. They are positions relative to other sectors, not grades.",
        "Percentiles are within the peer set unless labeled 'vs all sectors' — only the composite scorecard compares across sectors.",
        ...(view === "qualitative" || view === "filings"
          ? [
              "Risk themes, going-concern language, CAMs, Item 1C and human-capital figures come from narrative text located by full-text search, not from tagged XBRL facts. They carry parsing risk the numeric views do not.",
              "The filing index covers a bounded recent window. 'None on file' over that window is not 'none ever'.",
            ]
          : []),
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {active?.loading && !active.data && (
        <StateBlock variant="loading" copy="Building the sector aggregate." />
      )}
      {active?.error && <StateBlock variant="error" copy={active.error.message} />}

      {view === "sector" && <SectorView />}
      {view === "qualitative" && qualitative.data && <QualitativeView surface={qualitative.data} />}
      {view === "filings" && filings.data && <FilingsView surface={filings.data} />}
    </PageShell>
  );
}
