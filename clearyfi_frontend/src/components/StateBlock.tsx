export interface RecoveryLink {
  label: string;
  /** Must resolve to a real route — placeholder links are forbidden (STYLE_GUIDE §10). */
  href: string;
}

export interface StateBlockProps {
  /**
   * `loading` — pulsing accent dot + shimmer, with a note when the path may be cold.
   * `empty` — a filing is on record but nothing mapped; **not** the same as "nothing filed".
   * `notFound` — mono HTTP code in the flag color, plus recovery chips.
   * `error` — the request failed.
   */
  variant: "loading" | "empty" | "notFound" | "error";
  /** Overrides the default title for the variant. */
  title?: string;
  /** Body copy. Say what the reader can do next. */
  copy?: string;
  /** Offered on `notFound` — give the reader somewhere real to go. */
  recovery?: RecoveryLink[];
  /** Shown under a `loading` state when the first request may be slow. */
  coldNote?: string;
  className?: string;
}

const DEFAULTS: Record<StateBlockProps["variant"], { title: string; copy: string }> = {
  loading: { title: "Loading", copy: "Fetching the latest filing data." },
  empty: {
    title: "Nothing mapped",
    copy: "A filing is on record for this period, but none of its fields map to our canonical schema yet.",
  },
  notFound: { title: "HTTP 404", copy: "We don't carry that entity. Check the ticker, or try a raw CIK." },
  error: { title: "Request failed", copy: "Something went wrong upstream. Try again in a moment." },
};

/**
 * The four shared non-data states (STYLE_GUIDE §6).
 *
 * The `empty` copy matters more than it looks: **empty is not "nothing was filed"**. Coverage
 * has real floors (XBRL from ~2009–2012, 13D/G structured XML from ~mid-2025), and a state
 * that silently implies absence of filings rather than absence of coverage is a lie by layout.
 */
export function StateBlock({
  variant,
  title,
  copy,
  recovery = [],
  coldNote,
  className,
}: StateBlockProps) {
  const d = DEFAULTS[variant];
  const isErr = variant === "notFound" || variant === "error";

  return (
    <div
      className={["state", variant === "loading" ? "state-loading" : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={["state-title", isErr ? "err" : null].filter(Boolean).join(" ")}>
        {variant === "loading" ? <span className="dot" /> : null}
        {variant === "notFound" ? (
          <span className="http-code">{title ?? d.title}</span>
        ) : (
          (title ?? d.title)
        )}
      </div>

      <div className="state-copy">{copy ?? d.copy}</div>

      {variant === "loading" ? (
        <>
          <div className="shimmer" style={{ width: "72%" }} />
          <div className="shimmer" style={{ width: "54%" }} />
          {coldNote ? <div className="cold-note">{coldNote}</div> : null}
        </>
      ) : null}

      {recovery.length ? (
        <div className="recovery-chips">
          {recovery.map((r) => (
            <a className="recovery-chip" href={r.href} key={r.href}>
              {r.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
