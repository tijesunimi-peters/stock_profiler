import type { ReactNode } from "react";

export interface ShellSubject {
  /** Subject name, e.g. `Companies`. */
  label: string;
  /**
   * Destination. **Omit for a planned-and-inert subject** — that renders a `<span>` with no
   * href and no handler, which is the honest way to name something not yet built
   * (STYLE_GUIDE §10.1). A dead `href="#"` is the forbidden version.
   */
  href?: string;
  /** Marks the active subject. */
  current?: boolean;
  /** What the subject will hold. Shown on hover for planned subjects. */
  title?: string;
}

export interface AppShellProps {
  /** Page content — usually a `Masthead` followed by sections. */
  children: ReactNode;
  /** Subject nav. Defaults to the product's seven subjects, three live and four planned. */
  subjects?: ShellSubject[];
  /** Subject-scoped actions (Compare · Screen · Coverage). */
  actions?: ShellSubject[];
  /**
   * Names the subject the actions belong to, rendered as `Actions · {subject}`.
   *
   * The actions group is subject-SCOPED — "Compare" means compare sectors on one page and
   * compare companies on another — so the label states which subject is in scope rather than
   * letting the reader assume it is global.
   */
  actionsSubject?: string;
  /** Standing reference links. Defaults to docs, methodology and the API reference. */
  reference?: ShellSubject[];
  /** Placeholder for the global ticker/CIK search. */
  searchPlaceholder?: string;
  className?: string;
}

/**
 * The seven subjects. **Four ship planned-and-inert on purpose** — hiding them would suppress
 * real information about what the product covers.
 */
const DEFAULT_SUBJECTS: ShellSubject[] = [
  { label: "Companies", href: "/company/AAPL", current: true },
  { label: "Sectors", href: "/sectors" },
  { label: "Managers", href: "/manager/1067983" },
  { label: "People", title: "Insiders across companies — planned" },
  { label: "Auditors", title: "Audit firms and their filers — planned" },
  { label: "Funds", title: "Fund families and mandates — planned" },
  { label: "Events", title: "Filing events timeline — planned" },
];

const DEFAULT_ACTIONS: ShellSubject[] = [
  { label: "Compare", href: "/compare" },
  { label: "Screen", href: "/screen" },
  { label: "Coverage", href: "/coverage" },
];

/** The standing reference group — always last, always the same three. */
const DEFAULT_REFERENCE: ShellSubject[] = [
  { label: "Docs & guide", href: "/guide" },
  { label: "Methodology", href: "/methodology" },
  { label: "API reference", href: "/docs" },
];

function NavItem({ item }: { item: ShellSubject }) {
  const cls = [
    "shell-nav-item",
    item.current ? "is-current" : null,
    item.href ? null : "is-planned",
  ]
    .filter(Boolean)
    .join(" ");

  // No href and no handler for a planned subject — the cursor must not invite a click.
  if (!item.href) {
    return (
      <span className={cls} title={item.title}>
        <span>{item.label}</span>
        <span className="shell-planned-badge">Planned</span>
      </span>
    );
  }
  return (
    <a className={cls} href={item.href}>
      <span>{item.label}</span>
    </a>
  );
}

/**
 * The one product shell every data page lives in (STYLE_GUIDE §4.2, §5): a fixed subject
 * sidebar and a sticky topbar carrying the global search.
 *
 * The sidebar names **the entity you are analysing** — the claim that the product is
 * entity-centric rather than report-centric. There is exactly one shell; do not build a second
 * nav for a new page.
 */
export function AppShell({
  children,
  subjects = DEFAULT_SUBJECTS,
  actions = DEFAULT_ACTIONS,
  actionsSubject,
  reference = DEFAULT_REFERENCE,
  searchPlaceholder = "Ticker or CIK…",
  className,
}: AppShellProps) {
  return (
    <div className={["cf-root", "cf-shell", className].filter(Boolean).join(" ")}>
      <aside className="app-side" aria-label="Primary navigation">
        <a className="shell-brand" href="/">
          <span className="shell-brand-name">ClearyFi</span>
          <span className="shell-brand-tag">SEC data</span>
        </a>

        <div className="shell-nav-label">Subjects</div>
        {subjects.map((s) => (
          <NavItem item={s} key={s.label} />
        ))}

        {actions.length ? (
          <>
            <div className="shell-nav-label">
              {actionsSubject ? `Actions · ${actionsSubject}` : "Actions"}
            </div>
            {actions.map((a) => (
              <NavItem item={a} key={a.label} />
            ))}
          </>
        ) : null}

        {reference.length ? (
          <>
            <div className="shell-nav-label">Reference</div>
            {reference.map((r) => (
              <NavItem item={r} key={r.label} />
            ))}
          </>
        ) : null}

        <div className="shell-side-foot">Data, not investment advice.</div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="shell-search">
            <span className="shell-search-ic">⌕</span>
            <input className="shell-search-input" placeholder={searchPlaceholder} />
            <span className="shell-kbd">⌘K</span>
          </div>
          <a className="shell-apiref" href="/docs">
            API reference ↗
          </a>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
