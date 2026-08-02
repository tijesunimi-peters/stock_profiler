/**
 * The six Manager views, ported from the prototype's `mgrData` and its MANAGERS block.
 *
 * A 13F filer described entirely by its own filings. Two rules run through every view:
 *
 *  - **No market values.** A 13F's dollar column is market-priced, so every cross-issuer figure
 *    is a STAKE — reported shares over the issuer's shares outstanding. Ranking by stake keeps
 *    pricing out of a comparison the filings can actually support.
 *  - **Nothing here scores the manager.** Lag, cadence, dissent rate and amendment velocity all
 *    describe how and when it files. None of them says whether it is any good.
 */
import { DumbbellChart, EventStrip, Histogram, ParetoChart } from "../../charts/bars";
import { SeriesChart, StepChart } from "../../charts/series";
import { ScatterPlot } from "../../charts/misc";
import { PeerStrip, WindowStrip } from "../../charts/strips";
import type { ManagerProfile } from "../../data/api";
import type { UniverseDist } from "../../data/hub-catalog";

/** The numbered header every manager view opens with. */
function MgrHead({ n, title, src }: { n?: string; title: string; src: string }) {
  return (
    <div className="mgr-head">
      {n && <span className="mgr-head-n">{n}</span>}
      <span className="mgr-head-title">{title}</span>
      <span className="mgr-head-src">{src}</span>
    </div>
  );
}

/** A tinted headline tile. */
function Tile({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="mgr-tile">
      <span className="mgr-tile-k">{k}</span>
      <span className="mgr-tile-v">{v}</span>
      <span className="mgr-tile-sub">{sub}</span>
    </div>
  );
}

/**
 * Where this manager sits among all the others on one measure.
 *
 * A position in the distribution is not a verdict: managers differ in policy, not only in
 * judgment, and a high dissent rate or a long lag is a description of practice.
 */
function UniverseStrip({ d, name, note }: { d: UniverseDist; name: string; note: string }) {
  return (
    <>
      <div className="mgr-dist-head">
        <span className="mgr-dist-focal">
          {name} · {d.label}
        </span>
        <span className="hub-hint">{d.medLabel}</span>
      </div>
      <PeerStrip
        variant="cloud"
        peers={d.vals.filter((v) => v.ticker !== name).map((v) => ({ id: v.ticker, label: v.ticker, value: v.val }))}
        marks={[{ id: "foc", label: name, value: d.focalVal, kind: "focal" }]}
        quantiles={{ lo: d.min, hi: d.max, q1: d.q1, q3: d.q3, med: d.med }}
        format={(v) => String(Math.round(v * 10) / 10)}
        axisLabels={false}
        label={`${name} against the manager universe`}
      />
      <div className="hub-note">{note}</div>
    </>
  );
}

function SourceFoot({ d }: { d: ManagerProfile }) {
  return <div className="mgr-source">{d.sourceNote}</div>;
}

// ============================================================ 01 · profile

export function ProfileView({ d }: { d: ManagerProfile }) {
  return (
    <div className="mgr">
      <MgrHead n="01" title="Profile" src="who this filer is, and what it has on record" />
      <div className="mgr-tiles">
        <Tile k="Positions reported" v={d.positions} sub="lines on the latest 13F information table" />
        <Tile k="Issuers added" v={d.addedLabel} sub="absent from the prior quarter’s table" />
        <Tile k="Issuers exited" v={d.exitedLabel} sub="a holding under $100M reads as an exit" />
        <Tile k="Acceptance lag" v={d.lagLabel} sub="after quarter end · 45-day deadline" />
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Positions reported over time</span>
          <span className="hub-hint">nine quarters of 13F information tables</span>
        </div>
        <SeriesChart
          series={[{ id: "pos", label: "Positions", kind: "focal", points: d.posTrend.map((v, i) => ({ period: d.quarters[i], value: v })) }]}
          format={(v) => Math.round(v).toLocaleString()}
          height={180}
          label="Positions reported per quarter"
        />
        <div className="hub-note">{d.posTrendNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Filer record</span>
          <span className="hub-hint">as stated on the filings themselves</span>
        </div>
        {d.profile.map((p) => (
          <div className="mgr-profile-row" key={p.k}>
            <span className="mgr-profile-k">{p.k}</span>
            <span className="mgr-profile-v">{p.v}</span>
            <span className="mgr-profile-src">{p.src}</span>
          </div>
        ))}
      </div>
      <SourceFoot d={d} />
    </div>
  );
}

// ============================================================ 02 · register footprint

export function FootprintView({ d }: { d: ManagerProfile }) {
  return (
    <div className="mgr">
      <MgrHead n="02" title="Register footprint" src="disclosed stakes across issuers — not portfolio weights" />

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Disclosed stakes, ranked</span>
          <span className="hub-hint">cumulative share of the ten largest stakes</span>
        </div>
        <ParetoChart
          rows={d.pareto.map((p) => ({ key: p.label, label: p.label, value: p.share, prior: p.cumPrior }))}
          format={(v) => `${v.toFixed(1)}%`}
          height={250}
          label="Disclosed stakes, ranked"
        />
        <div className="hub-note">{d.paretoNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Where this manager matters</span>
          <span className="hub-hint">stake against how many managers report the issuer</span>
        </div>
        <ScatterPlot
          points={d.stakes.map((x) => ({ id: x.ticker, label: x.ticker, x: x.stake, y: x.holders }))}
          xLabel="stake in the issuer"
          yLabel="managers reporting the issuer"
          format={(v) => String(Math.round(v * 10) / 10)}
          height={320}
          label="Stake against register breadth"
        />
        <div className="hub-note">{d.scatterNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Where the stakes moved</span>
          <span className="hub-hint">prior quarter to current, in percentage points of the issuer</span>
        </div>
        {/*
          The prototype's own chart, not a DOM row set: hollow is the prior quarter's stake and
          filled the current one, which is the pair that carries the direction.
        */}
        <DumbbellChart
          rows={d.stakes
            .slice(0, 8)
            .slice()
            .sort((a, b) => b.stake - b.prior - (a.stake - a.prior))
            .map((x) => ({ key: x.ticker, label: x.ticker, prior: x.prior, current: x.stake }))}
          format={(v) => `${v.toFixed(2)}%`}
          label="Where the stakes moved"
        />
        <div className="hub-note">
          Hollow is the stake as reported in the prior quarter’s 13F, filled the current one. A
          stake can move because the manager traded or because the issuer changed its share count
          — the filing does not separate them.
        </div>

        <div className="mgr-sub">Largest disclosed stakes</div>
        <div className="mgr-stake-head">
          <span>Issuer</span>
          <span>Name</span>
          <span>Sector</span>
          <span className="ta-r">Stake</span>
          <span className="ta-r">vs prior</span>
        </div>
        {d.stakes.map((x) => (
          <div className="mgr-stake-row" key={x.ticker}>
            <span className="mgr-stake-tk">{x.ticker}</span>
            <span className="mgr-stake-name">{x.name}</span>
            <span className="hub-cell-mono is-soft">{x.sector}</span>
            <span className="hub-cell-mono ta-r">{x.stakeLabel}</span>
            <span className="hub-cell-mono ta-r is-soft">{x.delta}</span>
          </div>
        ))}
        <div className="hub-note">
          Stake is the manager’s reported share count over the issuer’s shares outstanding.
          Ranking by stake rather than by reported value keeps market pricing out of the
          comparison.
        </div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Positions by issuer sector</span>
          <span className="hub-hint">counted by position, and weighted by disclosed stake</span>
        </div>
        {d.sectorMix.map((g) => (
          <div className="mgr-sec-row" key={g.k}>
            <span className="mgr-sec-name">{g.k}</span>
            <span className="mgr-sec-bars">
              <span className="mgr-sec-track">
                <span className="mgr-sec-fill" style={{ width: g.w }} />
                <span className="mgr-sec-med" style={{ left: g.pw }} />
              </span>
              <span className="mgr-sec-track">
                <span className="mgr-sec-fill is-stake" style={{ width: g.sw }} />
              </span>
            </span>
            <span className="hub-cell-mono ta-r">{g.pctLabel}</span>
            <span className="mgr-sec-sw ta-r">{g.swLabel}</span>
          </div>
        ))}
        <div className="mgr-legend">
          <span>
            <i className="mgr-key" />
            share of positions · tick is the all-manager median
          </span>
          <span>
            <i className="mgr-key is-stake" />
            share of disclosed stake
          </span>
        </div>
        <div className="hub-note">
          {d.sectorNote} The second bar weights the same sector by disclosed stake instead of
          position count, so one large holding shows up where a count cannot see it.
        </div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Distribution of disclosed stakes</span>
          <span className="hub-hint">how large this manager’s stakes typically are</span>
        </div>
        <Histogram
          bins={d.stakeBins}
          median={1}
          format={(v) => `${Math.round(v)}%`}
          xLabel="stake in the issuer, percentage points"
          height={190}
          label="Distribution of disclosed stakes"
        />
        <div className="hub-note">{d.stakeHistNote}</div>
      </div>
      <SourceFoot d={d} />
    </div>
  );
}

// ============================================================ 03 · voting record

export function VotingView({ d }: { d: ManagerProfile }) {
  return (
    <div className="mgr">
      <MgrHead n="03" title="Voting record" src="N-PX — how this manager voted the shares it reported" />
      <div className="mgr-tiles is-wide">
        <Tile k="Voted with management" v={d.supportLabel} sub="share of ballots cast as the board recommended" />
        <Tile k="Against say-on-pay" v={d.sopLabel} sub="share of compensation votes cast against" />
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Dissent over time</span>
          <span className="hub-hint">share of compensation votes cast against, by N-PX year</span>
        </div>
        <SeriesChart
          series={[{ id: "ag", label: "Against say-on-pay", kind: "b", points: d.againstTrend.map((v, i) => ({ period: d.npxYears[i], value: v })) }]}
          format={(v) => `${v.toFixed(1)}%`}
          height={180}
          label="Dissent over time"
        />
        <div className="hub-note">{d.againstNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Against say-on-pay, across every manager</span>
          <span className="hub-hint">position in the manager universe</span>
        </div>
        <UniverseStrip d={d.sopDist} name={d.name} note={d.sopDistNote} />
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">How each category was voted</span>
          <span className="hub-hint">ordered by the against share</span>
        </div>
        {d.voteCats.map((v) => (
          <div className="mgr-vote" key={v.k}>
            <div className="mgr-vote-head">
              <span className="mgr-vote-k">{v.k}</span>
              <span className="hub-hint">{v.meetings}</span>
            </div>
            {/* Three shares of one ballot set — for / against / abstain. Not a severity ramp. */}
            <div className="mgr-vote-bar">
              <div className="is-for" style={{ width: v.fw }} />
              <div className="is-against" style={{ width: v.aw }} />
              <div className="is-abstain" style={{ width: v.bw }} />
            </div>
            <div className="mgr-vote-legend">
              <span>for {v.forPct}</span>
              <span>against {v.againstPct}</span>
              <span>abstain / withheld {v.abstainPct}</span>
            </div>
          </div>
        ))}
        <div className="hub-note">{d.voteNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Selected votes at issuers it holds</span>
          <span className="hub-hint">one row per reported ballot</span>
        </div>
        {d.notable.map((n, i) => (
          <div className="mgr-notable-row" key={`${n.issuer}${i}`}>
            <span className="mgr-stake-tk">{n.issuer}</span>
            <span className="mgr-stake-name">{n.item}</span>
            <span className="mgr-notable-vote">{n.vote}</span>
            <span className="hub-cell-mono ta-r is-soft">{n.meeting}</span>
          </div>
        ))}
        <div className="hub-note">
          N-PX reports the ballot and the vote cast. It carries no explanation, so nothing here
          says why a vote went the way it did.
        </div>
      </div>
      <SourceFoot d={d} />
    </div>
  );
}

// ============================================================ 04 · 5% filings

export function FivePercentView({ d }: { d: ManagerProfile }) {
  return (
    <div className="mgr">
      <MgrHead n="04" title="5% filings" src="Schedules 13D and 13G filed by this manager" />

      {d.hasCamp ? (
        <>
          <div className="p-card mgr-mt">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Filing history by issuer</span>
              <span className="hub-hint">stake as reported in each filing</span>
            </div>
            <EventStrip
              lanes={d.campaigns.map((c) => ({
                id: c.name,
                label: `${c.name} · ${c.formCode}`,
                events: c.evs.map((e, i) => ({ id: `${c.name}-${i}`, date: e.date, kind: c.formCode, title: `${e.tag} · ${e.pct.toFixed(1)}%` })),
              }))}
              height={Math.max(120, d.campaigns.length * 52)}
              label="5% filing history by issuer"
            />
            <div className="hub-note">{d.campNote}</div>
          </div>

          <div className="p-card mgr-mt">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Every 5% position on one axis</span>
              <span className="hub-hint">sequential or overlapping campaigns</span>
            </div>
            <StepChart
              series={d.campaigns.map((c) => ({ id: c.name, label: c.name, points: c.evs.map((e) => ({ date: e.date, value: e.pct })) }))}
              threshold={5}
              height={300}
              label="Every 5% position on one axis"
            />
            <div className="hub-note">{d.campOverlayNote}</div>
          </div>

          <div className="p-card mgr-mt">
            <div className="hub-panel-head">
              <span className="hub-panel-title">Largest position, filing by filing</span>
              <span className="hub-hint">the step line holds flat until the next amendment</span>
            </div>
            <StepChart
              series={[{ id: "largest", label: d.campaigns[0].name, points: d.steps.map((s) => ({ date: s.date, value: s.pct })) }]}
              threshold={5}
              height={240}
              label="Largest position, filing by filing"
            />
            <div className="hub-note">
              An amendment is required when the holder’s stated purpose or stake materially
              changes, so the steps are the record rather than an inference.
            </div>
          </div>
        </>
      ) : (
        /* A structural absence, stated. Most managers never cross 5% anywhere. */
        <div className="p-card mgr-mt">
          <div className="mgr-empty">{d.campEmpty}</div>
        </div>
      )}
      <SourceFoot d={d} />
    </div>
  );
}

// ============================================================ 05 · filing activity

export function ActivityView({ d }: { d: ManagerProfile }) {
  return (
    <div className="mgr">
      <div className="mgr-head">
        <span className="mgr-head-title">Filing activity</span>
        <span className="mgr-head-src">the filing act is near-real-time; the positions inside it are not</span>
        <span className="mgr-head-spacer" />
        <span className="hub-hint">as of {d.nowLabel}</span>
      </div>

      <div className="mgr-newest">
        <span className="mgr-newest-k">Newest fact</span>
        <span className="mgr-newest-form">{d.newestForm}</span>
        <span className="mgr-newest-subject">{d.newestSubject}</span>
        <span className="hub-hint">{d.newestTag}</span>
        <span className="mgr-newest-subject">{d.newestAgo}</span>
        <span className="hub-hint">{d.newestWhy}</span>
      </div>

      <div className="mgr-tiles is-act">
        <Tile k="Since last filing" v={d.sinceLastLabel} sub={`median gap for this manager is ${d.medGapLabel}`} />
        <Tile k="Position data age" v={d.posAgeLabel} sub={`13F as of ${d.posAsOf} · the newest position fact`} />
        <Tile k="Next 13F due" v={d.nextDueLabel} sub={`in ${d.nextDueIn} · ${d.nextDueSub}`} />
        <Tile k="Insider filings" v={d.s16Label} sub={d.s16Sub} />
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Acceptance stream</span>
          <span className="hub-hint">EDGAR timestamps, newest first · {d.streamCount}</span>
        </div>
        <div className="mgr-stream-head">
          <span>Accepted</span>
          <span>Form</span>
          <span>Subject · what the filing says</span>
          <span className="ta-r">Age</span>
        </div>
        {d.stream.map((f, i) => (
          <div className="mgr-stream-row" key={`${f.form}${f.date}${i}`}>
            <span className="mgr-stream-when">
              <span className="hub-cell-mono">{f.date}</span>
              <span className="mgr-stream-time">{f.time}</span>
            </span>
            <span className="mgr-stream-form" style={{ color: f.color, borderColor: f.color }}>
              {f.form}
            </span>
            <span className="mgr-stream-subject">
              <span className="mgr-stream-title">
                <span>{f.subject}</span>
                <span className="hub-hint">{f.tag}</span>
              </span>
              <span className="mgr-stream-detail">{f.detail}</span>
            </span>
            <span className="hub-cell-mono ta-r is-soft">{f.ago}</span>
          </div>
        ))}
        <div className="hub-note">{d.streamNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Staleness ledger</span>
          <span className="hub-hint">how old the newest fact of each kind is</span>
        </div>
        {d.ledger.map((l) => (
          <div className="mgr-ledger" key={l.k}>
            <div className="mgr-ledger-head">
              <span className="mgr-ledger-k">{l.k}</span>
              <span className="mgr-ledger-age">
                <span className="hub-hint">{l.asOf}</span>
                <span className="hub-cell-mono">{l.ageLabel}</span>
              </span>
            </div>
            <div className="mgr-ledger-track">
              <div style={{ width: l.w, background: l.color }} />
            </div>
            <div className="mgr-ledger-foot">
              <span className="mgr-ledger-what">{l.what}</span>
              <span className="hub-hint">{l.cant}</span>
            </div>
          </div>
        ))}
        <div className="hub-note">{d.ledgerNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Filing cadence</span>
          <span className="hub-hint">the baseline that makes silence legible</span>
        </div>
        <Histogram
          bins={d.gapBins}
          median={d.medGap}
          format={(v) => `${Math.round(v)} d`}
          xLabel="days between consecutive filings"
          height={190}
          label="Filing cadence"
        />
        <div className="hub-note">{d.cadenceNote}</div>
      </div>

      {d.hasAmend && (
        <div className="p-card mgr-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Amendment velocity</span>
            <span className="hub-hint">days from each 5% filing to its next amendment</span>
          </div>
          {d.amendGaps.map((a) => (
            <div className="mgr-amend-row" key={a.issuer}>
              <span className="mgr-amend-id">
                <span className="mgr-stake-name">{a.issuer}</span>
                <span className="mgr-stream-detail">{a.pace}</span>
              </span>
              <span className="mgr-amend-form" style={{ color: a.color }}>
                {a.form}
              </span>
              <span className="mgr-amend-track">
                <span style={{ width: a.w, background: a.color }} />
              </span>
              <span className="hub-cell-mono ta-r">{a.gapLabel}</span>
            </div>
          ))}
          <div className="hub-note">{d.actAmendNote}</div>
        </div>
      )}

      {d.hasCross && (
        <div className="p-card mgr-mt">
          <div className="hub-panel-head">
            <span className="hub-panel-title">Threshold crossings</span>
            <span className="hub-hint">the filing date is the event date</span>
          </div>
          {d.crossings.map((c, i) => (
            <div className="mgr-cross-row" key={`${c.issuer}${c.level}${i}`}>
              <span className="mgr-stake-tk">{c.issuer}</span>
              <span className="mgr-amend-form" style={{ color: c.color }}>
                {c.form}
              </span>
              <span className="hub-cell-mono">
                {c.arrow} {c.level}
              </span>
              <span className="hub-hint">
                {c.date} · {c.dir} · {c.detail}
              </span>
            </div>
          ))}
          <div className="hub-note">{d.crossNote}</div>
        </div>
      )}

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">When this manager files</span>
          <span className="hub-hint">acceptance hour, and position in the deadline window</span>
        </div>
        <div className="mgr-when">
          <div>
            <div className="hub-label">Acceptance hour</div>
            <Histogram
              bins={d.hourBins}
              median={d.medHour}
              format={(v) => `${Math.round(v)}:00`}
              xLabel="acceptance hour, UTC"
              height={190}
              label="Acceptance hour"
            />
            <div className="hub-note">{d.hourNote}</div>
          </div>
          <div>
            <div className="hub-label">Position in the 13F window</div>
            <WindowStrip statutory={45} filings={d.windowRows.map((f) => ({ id: `${f.form}${f.date}`, label: f.form, day: f.day }))} />
          </div>
        </div>
        <div className="hub-note">{d.actBehaviourNote}</div>
      </div>

      <div className="mgr-limits">
        <div className="hub-label">What “activity” cannot mean here</div>
        {d.actLimits.map((l) => (
          <div className="mgr-limit-row" key={l}>
            <span className="mgr-limit-dash">—</span>
            <span className="mgr-limit-text">{l}</span>
          </div>
        ))}
      </div>
      <SourceFoot d={d} />
    </div>
  );
}

// ============================================================ 06 · filing behaviour

export function BehaviourView({ d }: { d: ManagerProfile }) {
  return (
    <div className="mgr">
      <MgrHead n="05" title="Filing behaviour" src="how and when this manager files, not how it performs" />

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Register mechanics</span>
          <span className="hub-hint">from EDGAR metadata and the manager’s own tables</span>
        </div>
        {d.behaviour.map((b) => (
          <div className="mgr-behaviour-row" key={b.k}>
            <span className="mgr-profile-k">{b.k}</span>
            <span className="mgr-behaviour-v">{b.v}</span>
            <span className="hub-hint">{b.note}</span>
          </div>
        ))}
        <div className="hub-note">{d.behaviourNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Acceptance lag, across every manager</span>
          <span className="hub-hint">position in the manager universe</span>
        </div>
        <UniverseStrip d={d.lagDist} name={d.name} note={d.lagDistNote} />
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Acceptance lag distribution</span>
          <span className="hub-hint">this manager’s own 13F filings</span>
        </div>
        <Histogram
          bins={d.lagBins}
          median={d.lag}
          format={(v) => `${Math.round(v)} d`}
          xLabel="days after quarter end"
          height={180}
          label="Acceptance lag distribution"
        />
        <div className="hub-note">{d.lagNote}</div>
      </div>

      <div className="p-card mgr-mt">
        <div className="hub-panel-head">
          <span className="hub-panel-title">Amendments per 100 filings</span>
          <span className="hub-hint">by quarter</span>
        </div>
        <SeriesChart
          series={[{ id: "amd", label: "Amendments per 100", kind: "b", points: d.amendSeries.map((v, i) => ({ period: d.quarters[i], value: v })) }]}
          format={(v) => v.toFixed(1)}
          height={170}
          label="Amendments per 100 filings"
        />
        <div className="hub-note">{d.amendNote}</div>
      </div>
      <SourceFoot d={d} />
    </div>
  );
}
