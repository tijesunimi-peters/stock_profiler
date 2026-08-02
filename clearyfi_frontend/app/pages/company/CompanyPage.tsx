/**
 * `/company/:symbol/:view` — the Company Hub, five sibling views over one registrant.
 *
 * This is the production route, kept (RECONCILIATION §2 resolution 3). The prototype's
 * Financial-history and Peer-relative surfaces come in as views of the hub rather than as
 * siblings of the sector app.
 */
import { EntityBar, StateBlock, STANDARD_DISCLOSURES } from "@ds";
import { api } from "../../data/api";
import { useApi, useScrollSpy } from "../../lib/useApi";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { humanDate } from "../../lib/format";
import { HubOverview, HubRail, HUB_SECTIONS } from "./HubOverview";
import { INST_SECTIONS } from "../../data/hub";
import { HistoryView } from "./HistoryView";
import { InstitutionalView } from "./InstitutionalView";
import { InsiderView } from "./InsiderView";
import { PeersView } from "./PeersView";

const VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "history", label: "Financial history" },
  { value: "institutional", label: "Institutional" },
  { value: "insider", label: "Insider activity" },
  { value: "peers", label: "Peer-relative" },
];

export function CompanyPage({ symbol, view }: { symbol: string; view: string }) {
  const sel = useSelection();
  const period = sel.period;

  const overview = useApi(() => api.company(symbol, period, sel.subIndustry), [symbol, period, sel.subIndustry]);
  const inst = useApi(() => api.companyInstitutional(symbol, period), [symbol, period]);
  const insider = useApi(() => api.companyInsider(symbol, period), [symbol, period]);
  const peers = useApi(() => api.companyPeers(symbol, period, sel.subIndustry), [symbol, period, sel.subIndustry]);

  // Both long views carry a jump list; each addresses its own section ordinals.
  const railSections = view === "overview" ? HUB_SECTIONS : view === "institutional" ? INST_SECTIONS : [];
  const activeSection = useScrollSpy(railSections.map((s) => s.href.slice(1)));

  const active =
    view === "history" ? null : view === "institutional" ? inst : view === "insider" ? insider : view === "peers" ? peers : overview;
  const o = overview.data;

  const disclosures = [
    STANDARD_DISCLOSURES.financials_floor,
    ...(view === "institutional" ? [STANDARD_DISCLOSURES.institutional_13f, STANDARD_DISCLOSURES.ownership_13dg_floor] : []),
    ...(view === "insider"
      ? [
          "Forms 3/4/5 cover officers, directors and 10% owners only. A large holder who is none of those does not appear, and that absence is structural rather than missing data.",
        ]
      : []),
    "Segment and geographic splits are an annual ASC 280 footnote carried forward — they are not re-disclosed each quarter.",
    STANDARD_DISCLOSURES.not_advice,
  ];

  return (
    <PageShell
      subject="company"
      title="Company hub"
      subtitle="Everything filed by this registrant · 10-K, 10-Q, 8-K, Forms 3/4/5 · as of latest filing"
      right={o ? `${o.filer.symbol} · ${o.sector.label}` : symbol}
      railWidth={178}
      contentMax={1320}
      railNote="Sector · period · company preserved across views (§7). Selecting a sector keeps your current metric focus."
      sections={
        railSections.length
          ? railSections.map((s) => ({ ...s, current: s.href.slice(1) === activeSection }))
          : undefined
      }
      /* The filing timeline rides EVERY hub view (the prototype gates it on `inHub`, which
         covers all five). It is the hub's standing answer to "how old is any of this?", so a
         view that drops it silently loses the page's freshness claim. */
      rightRail={<HubRail />}
      controlBar={
        o ? (
          <>
          <EntityBar
            cells={[
              { label: "Company", value: o.filer.symbol, primary: true, mono: true },
              { label: "Peer set", value: o.sector.label },
              { label: "Period", value: "Q1 FY26", mono: true },
              {
                label: "Last filed",
                value: `${o.latestFiling.form} · ${humanDate(o.latestFiling.filed)}`,
                mono: true,
              },
            ]}
            /* The bar's standing caveat: these are as-filed values, and an amendment does not
               reach back and change them. */
            note="Facts as filed · not restated for later amendments"
          />
          </>
        ) : undefined
      }
      views={VIEWS}
      activeView={view}
      onView={(v) => navigate(sel.href(`/company/${symbol}/${v}`))}
      disclosures={disclosures}
    >
      {active?.loading && !active.data && <StateBlock variant="loading" copy="Reading this filer's facts." />}
      {active?.error && <StateBlock variant="error" copy={active.error.message} />}

      {view === "overview" && <HubOverview />}
      {view === "history" && <HistoryView />}
      {view === "institutional" && inst.data && <InstitutionalView surface={inst.data} />}
      {view === "insider" && insider.data && <InsiderView surface={insider.data} />}
      {view === "peers" && peers.data && <PeersView surface={peers.data} />}
    </PageShell>
  );
}
