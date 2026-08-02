/**
 * A planned-and-inert subject.
 *
 * The four planned subjects are named in the sidebar on purpose — hiding them would suppress
 * real information about what the product covers. Landing on one has to be equally honest: it
 * says what the subject WILL hold and offers somewhere real to go, rather than pretending to be
 * an empty version of itself.
 */
import { StateBlock } from "@ds";
import { useSelection } from "../state";
import { PageShell } from "../ui/Shell";

const COPY: Record<string, { title: string; body: string }> = {
  people: {
    title: "People",
    body: "Insiders across companies — one officer or director followed through every Form 3/4/5 they appear on, at every issuer. The Section 16 ledger that powers a company's insider view already holds the rows; what is missing is the person-level identity resolution that makes 'the same Jane Doe at two issuers' a defensible claim rather than a name match.",
  },
  auditors: {
    title: "Auditors",
    body: "Audit firms and the filers they sign. Auditor name, opinion, tenure and Critical Audit Matters come from the auditor's report; changes come from 8-K Item 4.01. All of it is narrative text rather than tagged facts, which is why it sits behind the numeric surfaces rather than beside them.",
  },
  funds: {
    title: "Funds",
    body: "Fund families and mandates, from N-PORT and N-PX. Distinct from Managers: a 13F filer is one reporting entity, while a fund family is many registrants whose relationship has to be established from the filings rather than assumed.",
  },
  events: {
    title: "Events",
    body: "A filing-events timeline across every subject — 8-K items, S-1 registrations, Form 15 deregistrations, 12b-25 notices. The sector view's 'What's moving' feed is a slice of this, walled off from the analytical panels so a daily event never reads as a quarterly aggregate.",
  },
};

export function PlannedPage({ name }: { name: string }) {
  const sel = useSelection();
  const copy = COPY[name] ?? { title: name, body: "Planned." };

  return (
    <PageShell
      subject="planned"
      plannedName={name}
      title={copy.title}
      right={["Planned — not built"].filter(Boolean).join(" · ")}
      disclosures={[
        "This subject is named in the navigation because it is planned, not because it exists. Nothing on this page is data.",
      ]}
    >
      <div className="planned-page">
        <h2>Planned — not built yet</h2>
        <p>{copy.body}</p>
      </div>
      <StateBlock
        variant="notFound"
        title="Nothing to show here yet"
        copy="This subject has no data behind it. These routes do."
        recovery={[
          { label: "Sector analytics", href: sel.href("/sectors") },
          { label: `Company · ${sel.focal}`, href: sel.href(`/company/${sel.focal}`) },
          { label: "Managers", href: sel.href(`/manager/${sel.managerCik}`) },
        ]}
      />
    </PageShell>
  );
}
