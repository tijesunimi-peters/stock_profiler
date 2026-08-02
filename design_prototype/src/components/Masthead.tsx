export interface MastheadProps {
  /** Page title — Hanken 800, the largest type on the page. */
  title: string;
  /**
   * Right-aligned mono meta lines. **State the as-of date here** — data is as of the latest
   * filing, never real-time (STYLE_GUIDE §9.7), and a view whose newest filing is old must say
   * so as prominently as the fact itself (§9.9).
   */
  meta?: string[];
  /** Optional intro paragraph below the rule. */
  lede?: string;
  /**
   * Mono accent kicker above the title. Omitted by default — inside the app shell the sidebar
   * already brands the page, so an eyebrow is redundant there.
   */
  eyebrow?: string;
  className?: string;
}

/**
 * The page header (STYLE_GUIDE §4.3): title → right-aligned mono meta → a single hairline rule
 * → optional intro copy.
 *
 * Every data page opens with one. The meta column is where filing age and coverage caveats
 * live, which is why it sits at the top rather than in a footnote.
 */
export function Masthead({ title, meta = [], lede, eyebrow, className }: MastheadProps) {
  return (
    <div className={["masthead", className].filter(Boolean).join(" ")}>
      <div className="masthead-top">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h1>{title}</h1>
        </div>
        {meta.length ? (
          <div className="masthead-meta">
            {meta.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="rule-double" />
      {lede ? <p className="lede">{lede}</p> : null}
    </div>
  );
}
