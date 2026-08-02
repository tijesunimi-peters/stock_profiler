/**
 * `/manager/:cik/:view` — six views behind the production manager route.
 */
import { EntityBar, StateBlock, STANDARD_DISCLOSURES } from "@ds";
import { api } from "../../data/api";
import { useApi } from "../../lib/useApi";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { humanDate } from "../../lib/format";
import { MANAGERS, MANAGER_BY_CIK } from "../../data/catalog";
import {
  ActivityView,
  BehaviourView,
  FivePercentView,
  FootprintView,
  ProfileView,
  VotingView,
} from "./views";

/** Categorical identity for a filer type — never a rating. */
const KIND_COLOR: Record<string, string> = {
  "Index & multi-asset": "var(--accent)",
  "Active equity": "var(--gaap-color)",
  "Hedge fund": "#A88C5F",
  "Bank & wealth": "var(--border-strong)",
};

const VIEWS = [
  { value: "profile", label: "Profile" },
  { value: "footprint", label: "Register footprint" },
  { value: "voting", label: "Voting record" },
  { value: "five-percent", label: "5% filings" },
  { value: "activity", label: "Filing activity" },
  { value: "behaviour", label: "Filing behaviour" },
];

export function ManagerPage({ cik, view }: { cik: number; view: string }) {
  const sel = useSelection();
  const period = sel.period;
  const known = MANAGER_BY_CIK[cik];

  const profile = useApi(() => api.manager(cik, period), [cik, period]);
  const footprint = useApi(() => api.managerFootprint(cik, period), [cik, period]);
  const voting = useApi(() => api.managerVoting(cik, period), [cik, period]);
  const five = useApi(() => api.managerFivePercent(cik, period), [cik, period]);
  const activity = useApi(() => api.managerActivity(cik, period), [cik, period]);
  const behaviour = useApi(() => api.managerBehaviour(cik, period), [cik, period]);

  const active =
    view === "footprint"
      ? footprint
      : view === "voting"
        ? voting
        : view === "five-percent"
          ? five
          : view === "activity"
            ? activity
            : view === "behaviour"
              ? behaviour
              : profile;

  const p = profile.data;

  if (!known) {
    return (
      <PageShell subject="manager" title={`CIK ${cik}`} disclosures={["No data is shown on this page."]}>
        <StateBlock
          variant="notFound"
          copy="No 13F filer with that CIK is in this illustrative universe."
          recovery={[
            { label: "Vanguard", href: sel.href("/manager/102909", { managerCik: 102909 }) },
            { label: "BlackRock", href: sel.href("/manager/1364742", { managerCik: 1364742 }) },
            { label: "Sector analytics", href: sel.href("/sectors") },
          ]}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      subject="manager"
      title="Managers"
      right={p ? `${known.kind} · ${p.positions} positions` : known.short}
      subtitle="A 13F filer described by its own filings · 13F-HR, SC 13D/G, N-PX · no market values used"
      controlBar={
        p ? (
          <>
          <EntityBar
            cells={[
              { label: "Manager", value: known.name, primary: true, swatch: KIND_COLOR[known.kind] },
              { label: "Classification", value: known.kind },
              { label: "CIK", value: String(known.cik), mono: true },
              { label: "Latest 13F", value: humanDate(p.filed), mono: true },
              { label: "Positions", value: String(p.positions), mono: true },
            ]}
            footer={
              <>
                <span className="ctrlbar-label">Change manager</span>
                <select
                  className="mgr-select"
                  value={String(cik)}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    sel.set({ managerCik: next });
                    navigate(sel.href(`/manager/${next}/${view}`, { managerCik: next }));
                  }}
                >
                  {MANAGERS.map((m) => (
                    <option key={m.cik} value={m.cik}>
                      {m.name} · {m.kind}
                    </option>
                  ))}
                </select>
              </>
            }
          />
          </>
        ) : undefined
      }
      views={VIEWS}
      activeView={view}
      onView={(v) => navigate(sel.href(`/manager/${cik}/${v}`, { managerCik: cik }))}
      disclosures={[
        STANDARD_DISCLOSURES.institutional_13f,
        STANDARD_DISCLOSURES.ownership_13dg_floor,
        "No market values appear anywhere on these views. 13F dollar columns are market-priced, and this product carries no market data — so size is expressed in shares and in the issuer's shares outstanding.",
        "N-PX voting records are annual, for the year ended 30 June. They lag by up to fourteen months.",
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {active.loading && !active.data && <StateBlock variant="loading" copy="Reading this manager's filings." />}
      {active.error && <StateBlock variant="error" copy={active.error.message} />}

      {view === "profile" && p && <ProfileView surface={p} />}
      {view === "footprint" && footprint.data && <FootprintView surface={footprint.data} />}
      {view === "voting" && voting.data && <VotingView surface={voting.data} />}
      {view === "five-percent" && five.data && <FivePercentView surface={five.data} />}
      {view === "activity" && activity.data && <ActivityView surface={activity.data} />}
      {view === "behaviour" && behaviour.data && <BehaviourView surface={behaviour.data} />}
    </PageShell>
  );
}
