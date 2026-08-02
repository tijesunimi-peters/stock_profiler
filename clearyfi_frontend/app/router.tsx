/**
 * A small history router.
 *
 * A VIEW IS A PATH SEGMENT (`/company/AAPL/statements`), not a client-side tab, so Back and
 * Forward walk views the way a reader expects — that is the design system's own rule for the
 * view rail, and it also closes the prototype's open item that "the URL does not reflect the
 * active view".
 *
 * The routes follow RECONCILIATION §2 resolution (3), split by altitude:
 *   /sectors/:view          sector · qualitative · filings
 *   /company/:symbol/:view  overview · history · institutional · insider · peers
 *   /manager/:cik/:view     profile · footprint · voting · five-percent · activity · behaviour
 *   /compare/sectors        sector-vs-sector
 *   /compare/companies      company-vs-company
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Location {
  path: string;
  query: URLSearchParams;
}

const LocationCtx = createContext<Location>({ path: "/", query: new URLSearchParams() });

function read(): Location {
  return {
    path: window.location.pathname.replace(/\/+$/, "") || "/",
    query: new URLSearchParams(window.location.search),
  };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(read);

  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener("popstate", on);
    window.addEventListener("cf:navigate", on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener("cf:navigate", on);
    };
  }, []);

  return <LocationCtx.Provider value={loc}>{children}</LocationCtx.Provider>;
}

export function useLocation(): Location {
  return useContext(LocationCtx);
}

/** Push a new URL. `replace` keeps the entry count down for same-view state changes. */
export function navigate(href: string, opts: { replace?: boolean } = {}): void {
  const current = `${window.location.pathname}${window.location.search}`;
  if (href === current) return;
  window.history[opts.replace ? "replaceState" : "pushState"]({}, "", href);
  window.dispatchEvent(new Event("cf:navigate"));
  // The prototype's `window.scrollTo({behavior:'smooth'})` was a no-op in its runtime;
  // `scrollingElement.scrollTop` worked. Both are fine here — keep the plain one.
  if (!opts.replace) document.scrollingElement?.scrollTo({ top: 0 });
}

export function Link({
  href,
  children,
  className,
  onClick,
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export interface RouteMatch {
  subject: "sectors" | "company" | "manager" | "compare" | "planned" | "home" | "notFound";
  /** Path segment for the active view within the subject. */
  view: string;
  /** `:symbol` for a company route, `:cik` for a manager route, `sectors`/`companies` for compare. */
  entity: string | null;
  /** The planned-but-unbuilt subject name, when `subject === "planned"`. */
  planned?: string;
}

const PLANNED = ["people", "auditors", "funds", "events"];

const COMPANY_VIEWS = ["overview", "history", "institutional", "insider", "peers"];
const MANAGER_VIEWS = ["profile", "footprint", "voting", "five-percent", "activity", "behaviour"];
const SECTOR_VIEWS = ["sector", "qualitative", "filings"];

export function matchRoute(path: string): RouteMatch {
  const seg = path.split("/").filter(Boolean);
  if (!seg.length) return { subject: "home", view: "", entity: null };

  if (seg[0] === "sectors") {
    const view = SECTOR_VIEWS.includes(seg[1]) ? seg[1] : "sector";
    return { subject: "sectors", view, entity: null };
  }
  if (seg[0] === "company" && seg[1]) {
    const view = COMPANY_VIEWS.includes(seg[2]) ? seg[2] : "overview";
    return { subject: "company", view, entity: seg[1].toUpperCase() };
  }
  if (seg[0] === "manager" && seg[1]) {
    const view = MANAGER_VIEWS.includes(seg[2]) ? seg[2] : "profile";
    return { subject: "manager", view, entity: seg[1] };
  }
  if (seg[0] === "compare") {
    const view = seg[1] === "companies" ? "companies" : "sectors";
    return { subject: "compare", view, entity: view };
  }
  if (PLANNED.includes(seg[0])) {
    return { subject: "planned", view: seg[0], entity: null, planned: seg[0] };
  }
  return { subject: "notFound", view: "", entity: null };
}

export function useRoute(): RouteMatch {
  const { path } = useLocation();
  return useMemo(() => matchRoute(path), [path]);
}

/**
 * Change one query parameter without losing the rest — this is how selection survives
 * cross-route navigation (RECONCILIATION §7), and why it lives in the URL rather than only in
 * memory.
 */
export function useSetParam(): (key: string, value: string | null, replace?: boolean) => void {
  const { query } = useLocation();
  return useCallback(
    (key, value, replace = true) => {
      const next = new URLSearchParams(query);
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      navigate(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { replace });
    },
    [query],
  );
}

/** Build a URL for another subject that CARRIES the current selection across the route change. */
export function withSelection(path: string, query: URLSearchParams, overrides: Record<string, string | null> = {}): string {
  const next = new URLSearchParams(query);
  for (const [k, v] of Object.entries(overrides)) {
    if (v == null) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}
