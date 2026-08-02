export interface FooterLink {
  label: string;
  /** Must resolve to a real route. */
  href: string;
}

export interface AppFooterProps {
  links?: FooterLink[];
  /** Muted right-aligned tagline. */
  tagline?: string;
  className?: string;
}

const DEFAULT_LINKS: FooterLink[] = [
  { label: "Company ↗", href: "/company/AAPL" },
  { label: "Coverage ↗", href: "/coverage" },
  { label: "API docs ↗", href: "/docs" },
];

/**
 * The page footer: a thin rule, mono accent links to real routes, and the standing tagline.
 *
 * Every link resolves — placeholder hrefs are forbidden (STYLE_GUIDE §10).
 */
export function AppFooter({
  links = DEFAULT_LINKS,
  tagline = "ClearyFi · public SEC data, cleaned & queryable",
  className,
}: AppFooterProps) {
  return (
    <div className={["app-footer", className].filter(Boolean).join(" ")}>
      {links.map((l) => (
        <a href={l.href} key={l.href}>
          {l.label}
        </a>
      ))}
      <span className="tagline">{tagline}</span>
    </div>
  );
}
