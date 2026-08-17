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
import { api } from "../data/api";

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

/**
 * Which entry in `PROVENANCE` this page is, derived from props the shell already has.
 *
 * Derived here rather than threaded through every caller: a disclosure that depends on nine pages
 * remembering to pass a string is a disclosure that will be wrong on one of them. `undefined`
 * means "not a named surface", which keeps the site-wide banner — the safe direction, because an
 * unnamed page falls back to the broad warning rather than to silence.
 */
function bannerSurface(subject: string, activeView?: string): string | undefined {
  if (subject === "company") {
    // Named per VIEW, because they are plumbed per view. `overview` is a mixture and is listed in
    // `partialSurfaces`; the other four are real and are named here so the banner disappears from
    // them — it was telling readers that nothing on the insider, institutional, peer-relative and
    // history pages came from a filing, which was false for all four.
    if (activeView === "overview") return "company overview";
    if (activeView === "insider") return "insider activity";
    if (activeView === "institutional") return "institutional";
    if (activeView === "peers") return "peer-relative";
    if (activeView === "history") return "financial history";
  }
  if (subject === "sectors") {
    // §Sector is plumbed and is deliberately NOT in `syntheticSurfaces`, so naming it here is what
    // removes the banner from that page. Its two sibling views are still fixtures and still named.
    if (activeView === "sector") return "sector";
    if (activeView === "qualitative") return "qualitative";
    if (activeView === "filings") return "filings";
  }
  return undefined;
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
  const sel = useSelection();

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
      onSearch={(q) => api.suggest(q)}
      /* A pick is a NAVIGATION: the path names the registrant, so choosing one has to change the
         path. Carrying the selection through `sel.href` keeps the reader's sector, period and
         focused theme rather than dropping them at the door. */
      onPick={(s) => navigate(sel.href(`/company/${s.ticker}/overview`, { focal: s.ticker }))}
    >
      {/*
        The banner needs to know WHICH surface it is disclaiming, now that some are mixtures.
        Derived here from props the shell already has rather than threaded through every caller —
        a disclosure that depends on nine pages remembering to pass a string is a disclosure that
        will be wrong on one of them.
      */}
      <SyntheticBanner surface={bannerSurface(subject, activeView)} />
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
      {/*
        The legal and support links are a LAUNCH REQUIREMENT, not decoration: the disclaimer and
        the support channel have to be reachable from every page footer (LAUNCH_READINESS §6, and
        `tests/test_static_pages.py` asserts it). They lived only on the server-rendered pages
        until this app took over every data surface (2026-08-17) — at which point every company,
        sector, manager and compare page would have lost them.

        Plain anchors, deliberately: these leave the app for server-rendered pages, so they must
        be real navigations rather than client-side routes.
      */}
      <div className="page-foot">
        <span>ClearyFi · public SEC data, cleaned &amp; queryable</span>
        <a href="/coverage">/coverage ↗</a>
        <a href="/docs">/docs ↗</a>
        <a href="/methodology">Sources &amp; methodology</a>
        <a href="/privacy">Privacy policy</a>
        <a href="/terms">Terms of service</a>
        <a href="https://github.com/clearyfi/support/issues" target="_blank" rel="noopener">
          Support
        </a>
        <span className="page-foot-spacer" />
        <a href="/disclaimer">Data, not investment advice</a>
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
