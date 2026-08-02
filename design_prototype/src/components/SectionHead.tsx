export interface SectionHeadProps {
  /** Mono section number, e.g. `01`. Rendered in the accent. */
  n: string;
  /** Section name. */
  title: string;
  className?: string;
}

/**
 * The numbered section header (STYLE_GUIDE §4.5): mono accent number + Hanken 800 name over a
 * 2px ink underline.
 *
 * The numbering is not decorative — it is what the view rail's section jump list addresses, so
 * keep numbers stable and sequential down the page.
 */
export function SectionHead({ n, title, className }: SectionHeadProps) {
  return (
    <div className={["section-head", className].filter(Boolean).join(" ")}>
      <span className="n">{n}</span>
      <h2>{title}</h2>
    </div>
  );
}
