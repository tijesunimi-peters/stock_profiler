/**
 * `/manager/:cik/:view` — six views behind the production manager route.
 *
 * The roster is the prototype's fourteen filers, addressed by CIK because that is the identity
 * EDGAR uses. An unknown CIK is a not-found, not an empty page: this universe is illustrative
 * and saying so beats rendering zeroes.
 */
import { EntityBar, StateBlock, STANDARD_DISCLOSURES } from "@ds";
import { navigate } from "../../router";
import { useSelection } from "../../state";
import { PageShell } from "../../ui/Shell";
import { MANAGER_ROSTER, managerData, mgrColor } from "../../data/manager";
import {
  ActivityView,
  BehaviourView,
  FivePercentView,
  FootprintView,
  ProfileView,
  VotingView,
} from "./views";

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
  const padded = String(cik).padStart(10, "0");
  const known = MANAGER_ROSTER.find((m) => m.cik === padded);

  if (!known) {
    return (
      <PageShell subject="manager" title={`CIK ${cik}`} disclosures={["No data is shown on this page."]}>
        <StateBlock
          variant="notFound"
          copy="No 13F filer with that CIK is in this illustrative universe."
          recovery={MANAGER_ROSTER.slice(0, 3)
            .map((m) => ({ label: m.name, href: sel.href(`/manager/${Number(m.cik)}/profile`) }))
            .concat([{ label: "Sector analytics", href: sel.href("/sectors") }])}
        />
      </PageShell>
    );
  }

  const d = managerData(known.cik);

  return (
    <PageShell
      subject="manager"
      title="Managers"
      right={`${d.kind} · ${d.positions} positions`}
      subtitle="A 13F filer described by its own filings · 13F-HR, SC 13D/G, N-PX · no market values used"
      controlBar={
        <EntityBar
          cells={[
            { label: "Manager", value: d.name, primary: true, swatch: mgrColor(d.kind) },
            { label: "Classification", value: d.kind },
            { label: "CIK", value: d.cik, mono: true },
            { label: "Positions", value: d.positions, mono: true },
          ]}
          footer={
            <>
              <span className="ctrlbar-label">Change manager</span>
              <select
                className="mgr-select"
                value={padded}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  sel.set({ managerCik: next });
                  navigate(sel.href(`/manager/${next}/${view}`, { managerCik: next }));
                }}
              >
                {MANAGER_ROSTER.map((m) => (
                  <option key={m.cik} value={m.cik}>
                    {m.name} · {m.kind}
                  </option>
                ))}
              </select>
            </>
          }
        />
      }
      views={VIEWS}
      activeView={view}
      onView={(v) => navigate(sel.href(`/manager/${cik}/${v}`, { managerCik: cik }))}
      rightRail={<ManagerRail d={d} />}
      railWidth={178}
      contentMax={1320}
      disclosures={[
        STANDARD_DISCLOSURES.institutional_13f,
        STANDARD_DISCLOSURES.ownership_13dg_floor,
        "No market values appear anywhere on these views. 13F dollar columns are market-priced, and this product carries no market data — so size is expressed in shares and in the issuer's shares outstanding.",
        "N-PX voting records are annual, for the year ended 30 June. They lag by up to fourteen months.",
        STANDARD_DISCLOSURES.not_advice,
      ]}
    >
      {view === "footprint" && <FootprintView d={d} />}
      {view === "voting" && <VotingView d={d} />}
      {view === "five-percent" && <FivePercentView d={d} />}
      {view === "activity" && <ActivityView d={d} />}
      {view === "behaviour" && <BehaviourView d={d} />}
      {view === "profile" && <ProfileView d={d} />}
    </PageShell>
  );
}

/**
 * The manager rail: the filing record, then the newest filings.
 *
 * The closing line is the whole altitude's caveat — only the filing ACT is near-real-time, and
 * the positions inside a 13F are as of a quarter end that may be months back.
 */
function ManagerRail({ d }: { d: ReturnType<typeof managerData> }) {
  return (
    <>
      <div className="rail-card">
        <div className="rail-label">Filing record</div>
        <div className="rail-heading">{d.name}</div>
        <div className="rail-rows">
          {d.railFacts.map((f) => (
            <div className="rail-row" key={f.k}>
              <span className="rail-row-k">{f.k}</span>
              <span className="rail-row-v">{f.v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rail-card">
        <div className="rail-label">Newest filings</div>
        <div className="hub-hint hub-mb-sm">EDGAR acceptance · {d.streamCount}</div>
        {d.railStream.map((e, i) => (
          <div className="hub-tl-row" key={`${e.form}${e.date}${i}`}>
            <span className="hub-tl-dot" style={{ background: e.color }} />
            <div className="hub-tl-body">
              <span className="hub-tl-date">
                {e.date} · {e.ago}
              </span>
              <span className="hub-tl-form">{e.form}</span>
              <span className="hub-tl-desc">{e.subject}</span>
            </div>
          </div>
        ))}
        <div className="hub-tl-foot">
          Only the filing act is near-real-time; positions inside a 13F are as of {d.posAsOf}.
        </div>
      </div>
    </>
  );
}
