/**
 * The page frame, ported from the prototype's own shell.
 *
 * Sidebar (three groups: Subjects · Actions·{subject} · Reference), sticky topbar, masthead
 * with a mono subtitle, a context bar that swaps per altitude, a view rail that is 132px at
 * sector altitude and 178px in the hub, a content column capped at 960px (1320px in the hub),
 * a 262px right rail that hides below 1240px, and the footer rule.
 *
 * Subject order, titles, labels and widths are the prototype's, not an interpretation of them.
 */
import { useEffect, type ReactNode } from "react";
import { AppShell, Disclosure, Masthead, ViewRail } from "@ds";
import { SyntheticBanner } from "./SyntheticBanner";
import type { ShellSubject, ViewRailItem, ViewRailSection } from "@ds";
import { useSelection } from "../state";
import { navigate } from "../router";

export type SubjectKey = "sectors" | "company" | "manager" | "compare" | "planned" | "home";

/**
 * The subject the current route belongs to — actions are scoped to it.
 *
 * There is no "Compare" subject. Compare is an ACTION, and which subject it belongs to is what
 * decides whether you are comparing two sectors or two companies — so a compare route declares
 * its parent subject and highlights the action, exactly as the prototype does.
 */
function subjectLabelFor(subject: SubjectKey): string {
  return subject === "sectors"
    ? "Sectors"
    : subject === "manager"
      ? "Managers"
      : "Companies";
}

/**
 * The seven subjects, in the prototype's order, with its titles.
 *
 * Four are PLANNED-AND-INERT: no href, no handler, and a `planned` badge. Naming them is
 * information about what the product covers; a dead `href="#"` would be a lie about it.
 */
function useSubjects(active: SubjectKey, plannedName?: string): ShellSubject[] {
  const sel = useSelection();
  const planned = (label: string, title: string): ShellSubject => ({
    label,
    title: `${title} — not built in this prototype`,
    current: plannedName === label.toLowerCase(),
  });
  return [
    {
      label: "Companies",
      href: sel.href(`/company/${sel.focalTicker}`),
      current: active === "company",
      title: "Registrants — 10-K, 10-Q, 8-K, proxy and Section 16 filings",
    },
    {
      label: "Sectors",
      href: sel.href("/sectors"),
      current: active === "sectors",
      title: "Peer groups of registrants, compared as populations",
    },
    planned("People", "Directors and officers as entities — board interlocks, Section 16 history, 8-K 5.02 moves"),
    {
      label: "Managers",
      href: sel.href(`/manager/${sel.managerCik}`),
      current: active === "manager",
      title: "13F filers as entities — register footprint, N-PX voting record, 13D campaigns",
    },
    planned("Auditors", "Audit firms as entities — client portfolio, CAM topics, fees, tenure"),
    planned("Funds", "Registered funds — N-CEN, N-PORT and N-CSR filings"),
    planned("Events", "Form cross-sections — every 4.02 restatement, 4.01 auditor change or 12b-25 in a period"),
  ];
}

/** Compare is the only live action; Screen and Coverage are named and inert. */
function useActions(active: SubjectKey, activeAction?: string): ShellSubject[] {
  const sel = useSelection();
  const subject = subjectLabelFor(active);
  const lower = subject.toLowerCase();
  const compareHref =
    subject === "Sectors"
      ? sel.href("/compare/sectors")
      : subject === "Companies"
        ? sel.href("/compare/companies")
        : undefined;
  return [
    {
      label: "Compare",
      href: compareHref,
      current: activeAction === "Compare",
      title:
        subject === "Sectors"
          ? "Two sectors side by side"
          : subject === "Companies"
            ? "Two companies side by side, across sectors"
            : "Two managers side by side — register footprint, voting record and filing behaviour — not built in this prototype",
    },
    {
      label: "Screen",
      current: activeAction === "Screen",
      title: `Filter the ${lower} universe on filing-derived criteria — not built in this prototype`,
    },
    {
      label: "Coverage",
      title: `Filing freshness and completeness across the ${lower} universe — not built in this prototype`,
    },
  ];
}

export interface PageShellProps {
  subject: SubjectKey;
  /** Highlights a sidebar ACTION (e.g. "Compare") — the route is an action of `subject`. */
  activeAction?: string;
  plannedName?: string;
  /** `Sector analytics` · `Company hub` · `Managers`. */
  title: string;
  /** The mono line under the title — what the page is built from. */
  subtitle?: string;
  /** The right-aligned mono line — what is currently selected. */
  right?: string;
  /** The persistent control bar for this altitude. */
  controlBar?: ReactNode;
  views?: ViewRailItem[];
  activeView?: string;
  onView?: (view: string) => void;
  /** In-page jump list for the active view's sections. */
  sections?: ViewRailSection[];
  /** Heading over the section list. Override when the entries are not in-page anchors. */
  sectionsLabel?: string;
  /** The mono note pinned under the rail. */
  railNote?: string;
  /** 132px at sector altitude, 178px in the hub and manager views. */
  railWidth?: number;
  /** 960px at sector altitude, 1320px in the hub and manager views. */
  contentMax?: number;
  rightRail?: ReactNode;
  /**
   * Coverage limits this page carries. The prototype has no such block; the style guide
   * requires one on every data page, so it is added rather than dropped.
   */
  disclosures?: string[];
  children: ReactNode;
}

export function PageShell({
  subject,
  activeAction,
  plannedName,
  title,
  subtitle,
  right,
  controlBar,
  views,
  activeView,
  onView,
  sections,
  sectionsLabel,
  railNote,
  railWidth = 132,
  contentMax = 960,
  rightRail,
  disclosures,
  children,
}: PageShellProps) {
  const subjects = useSubjects(subject, plannedName);
  const actions = useActions(subject, activeAction);

  // Chrome around the content column: sidebar + page padding + rail + gaps + right rail.
  useEffect(() => {
    const chrome = 56 + railWidth + 20 + (rightRail ? 262 + 20 : 0);
    document.documentElement.style.setProperty("--page-max", `${contentMax + chrome}px`);
    return () => {
      document.documentElement.style.removeProperty("--page-max");
    };
  }, [contentMax, railWidth, rightRail]);

  const body = (
    <div className="alt-body">
      <div className="alt-content" style={{ maxWidth: `${contentMax}px` }}>
        {children}
      </div>
      {rightRail && <aside className="right-rail">{rightRail}</aside>}
    </div>
  );

  return (
    <AppShell
      subjects={subjects}
      actions={actions}
      actionsSubject={subjectLabelFor(subject)}
      searchPlaceholder="Search ticker or CIK…"
    >
      <SyntheticBanner />
      <Masthead title={title} subtitle={subtitle} meta={right ? [right] : undefined} />
      {controlBar}
      {/*
        Presence of the rail does not depend on one of its entries being active. A compare route
        is an ACTION of the subject, not one of its views, so the rail renders with nothing lit —
        which is the prototype's state and tells the reader where they are relative to the views.
      */}
      {views && views.length ? (
        <ViewRail
          views={views}
          active={activeView ?? ""}
          onChange={(v) => onView?.(v)}
          sections={sections}
          sectionsLabel={sectionsLabel}
          note={railNote}
          width={railWidth}
        >
          {body}
        </ViewRail>
      ) : (
        body
      )}
      {disclosures?.length ? <Disclosure items={disclosures} /> : null}
      <div className="page-foot">
        <span>ClearyFi · public SEC data, cleaned &amp; queryable</span>
        <a href="/coverage">/coverage ↗</a>
        <a href="/docs">/docs ↗</a>
        <span className="page-foot-spacer" />
        <span>Data, not investment advice.</span>
      </div>
    </AppShell>
  );
}

/**
 * Intercepts same-origin anchor clicks so the design system's plain `<a href>` navigation
 * routes client-side instead of reloading the app.
 */
export function useAnchorRouting(): (e: React.MouseEvent<HTMLDivElement>) => void {
  return (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const a = (e.target as HTMLElement).closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("/") || a.getAttribute("target")) return;
    e.preventDefault();
    navigate(href);
  };
}
