/**
 * Company Hub → Insider activity.
 *
 * EVERY surface on this view reads ONE shared Section 16 ledger, so the tiles, the code mix,
 * the per-person rollup and the latency histogram cannot disagree. That consolidation was the
 * fix for a whole class of prototype bugs and it is enforced here by construction: nothing
 * below draws a second sample.
 */
import { useMemo } from "react";
import { ChartCard, SectionHead, StatTile, StatTileRow, StatusChip } from "@ds";
import { INSIDER_CODES, type CompanyInsiderSurface } from "../../data/surfaces";
import { compact, humanDate, plural } from "../../lib/format";
import { quantiles } from "../../lib/seed";
import { Histogram } from "../../charts/bars";
import { DotCalendar } from "../../charts/misc";
import { PctBar, StackedBar } from "../../ui/primitives";

export function InsiderView({ surface }: { surface: CompanyInsiderSurface }) {
  const L = surface.ledger;

  const rollup = useMemo(() => {
    const byPerson = new Map<string, { role: string; buys: number; sells: number; shares: number }>();
    for (const t of L) {
      const row = byPerson.get(t.person) ?? { role: t.role, buys: 0, sells: 0, shares: 0 };
      if (t.code === "P") row.buys += t.shares;
      if (t.code === "S") row.sells += t.shares;
      row.shares += t.shares;
      byPerson.set(t.person, row);
    }
    return [...byPerson.entries()].sort((a, b) => b[1].shares - a[1].shares);
  }, [L]);

  const codeMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of L) counts.set(t.code, (counts.get(t.code) ?? 0) + t.shares);
    return [...counts.entries()].map(([key, share]) => ({
      key,
      label: `${key} — ${INSIDER_CODES[key as keyof typeof INSIDER_CODES]}`,
      share,
    }));
  }, [L]);

  const openMarket = L.filter((t) => t.code === "P" || t.code === "S");
  const bought = openMarket.filter((t) => t.code === "P").reduce((a, t) => a + t.shares, 0);
  const sold = openMarket.filter((t) => t.code === "S").reduce((a, t) => a + t.shares, 0);
  const late = L.filter((t) => t.lateness > 2);
  const lat = quantiles(L.map((t) => t.lateness));

  const planSales = L.filter((t) => t.code === "S" && t.plan);
  const discretionary = L.filter((t) => t.code === "S" && !t.plan);
  const withheld = L.filter((t) => t.code === "F");

  return (
    <>
      <section className="section">
        <SectionHead n="01" title="Section 16 ledger" />
        <StatTileRow>
          <StatTile label="Reported transactions" value={String(L.length)} note={`${humanDate(surface.windowStart)} → ${humanDate(surface.windowEnd)}`} />
          <StatTile label="Open-market bought" value={compact(bought)} note="code P only" />
          <StatTile label="Open-market sold" value={compact(sold)} note="code S only" />
          <StatTile label="Filed late" value={String(late.length)} note="beyond the two-business-day rule" />
        </StatTileRow>
        <p className="panel-note">
          Only codes <b>P</b> and <b>S</b> are decisions to buy or sell. Grants (A), option
          exercises (M), tax withholding (F) and gifts (G) move shares without expressing a view,
          and folding them into a "net insider buying" figure is the most common way this data is
          misread.
        </p>
      </section>

      <section className="section">
        <SectionHead n="02" title="Transaction code mix" />
        <ChartCard title="Shares by transaction code" caption="Share of all reported shares, by code. Codes are categories — the ramp is single-hue because they are parts of one total, not a severity scale.">
          <StackedBar parts={codeMix} />
        </ChartCard>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Code glossary</span>
            <span className="panel-hint">Form 4 Table I / II</span>
          </div>
          <div className="rows">
            {Object.entries(INSIDER_CODES).map(([code, meaning]) => (
              <div className="row" key={code}>
                <span className="form-badge">{code}</span>
                <span className="row-main">{meaning}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="03" title="Disposition split" />
        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">How shares left</span>
              <span className="panel-hint">sales and withholding</span>
            </div>
            <div className="rows">
              <div className="row">
                <span className="row-main">
                  <span className="row-title">Rule 10b5-1 plan sales</span>
                  <div className="row-sub">scheduled in advance — not a same-day decision</div>
                </span>
                <span className="row-num">{plural(planSales.length, "sale")}</span>
              </div>
              <div className="row">
                <span className="row-main">
                  <span className="row-title">Discretionary sales</span>
                  <div className="row-sub">no plan referenced on the form</div>
                </span>
                <span className="row-num">{plural(discretionary.length, "sale")}</span>
              </div>
              <div className="row">
                <span className="row-main">
                  <span className="row-title">Shares withheld for tax</span>
                  <div className="row-sub">code F — an automatic consequence of vesting</div>
                </span>
                <span className="row-num">{plural(withheld.length, "event")}</span>
              </div>
            </div>
          </div>

          <ChartCard
            title="Filing latency"
            caption="Business days between the transaction and the Form 4. Section 16 requires filing within two business days; anything beyond that is late."
          >
            <Histogram
              values={L.map((t) => t.lateness)}
              median={lat.med}
              format={(v) => `${Math.round(v)}d`}
              height={190}
              label="Filing latency"
            />
          </ChartCard>
        </div>
      </section>

      <section className="section">
        <SectionHead n="04" title="By person" />
        <div className="panel">
          <div className="rows">
            {rollup.map(([person, r]) => (
              <div className="row" key={person}>
                <span className="row-main">
                  <span className="row-title">{person}</span>
                  <div className="row-sub">{r.role}</div>
                </span>
                <div style={{ width: 160 }}>
                  <PctBar value={r.shares} max={rollup[0][1].shares} right={compact(r.shares)} />
                </div>
                <span className="row-num">
                  {r.buys ? `${compact(r.buys)} bought` : "—"} / {r.sells ? `${compact(r.sells)} sold` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="05" title="Form 144 notices" />
        <ChartCard
          title="Proposed sales, by date and size"
          caption="A Form 144 is a NOTICE of intent to sell, not a sale. Circle area is proportional to shares noticed — area, not radius, so a circle twice as wide is four times the shares."
        >
          <DotCalendar
            notices={surface.form144}
            format={(v) => `${compact(v)} shares`}
            height={170}
            label="Form 144 notices"
          />
        </ChartCard>
      </section>

      <section className="section">
        <SectionHead n="06" title="What this view cannot tell you" />
        <div className="panel">
          <div className="rows">
            <div className="row">
              <StatusChip status="na" />
              <span className="row-main">
                Holdings below the Section 16 threshold. Only officers, directors and 10% owners
                file — a large holder who is none of those appears nowhere on this page.
              </span>
            </div>
            <div className="row">
              <StatusChip status="na" />
              <span className="row-main">
                Intent. A 10b5-1 plan sale was scheduled months earlier; a discretionary sale was
                not. Neither tells you what the insider believes.
              </span>
            </div>
            <div className="row">
              <StatusChip status="nm" />
              <span className="row-main">
                A "net buy/sell ratio" that mixes codes. Grants and tax withholding are not
                decisions, so a ratio built over all codes is computable and misleading.
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
