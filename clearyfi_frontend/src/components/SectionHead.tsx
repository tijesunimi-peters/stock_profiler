export interface SectionHeadProps {
  /** Mono section number, e.g. `01`. Rendered in the accent. */
  n: string;
  /** Section name. */
  title: string;
  /**
   * A mono line under the title, above the rule — what this section is and how to read it.
   *
   * It sits INSIDE the header rather than as a paragraph below it because it is part of the
   * heading's claim: "band = IQR · tick = median" tells the reader how to decode every chart in
   * the section, and floating free it would read as a caption for the first panel only.
   */
  subtitle?: string;
  className?: string;
}

/**
 * The numbered section header (STYLE_GUIDE §4.5): mono accent number + Hanken 800 name, an
 * optional mono subtitle, all over a 2px ink underline.
 *
 * The numbering is not decorative — it is what the view rail's section jump list addresses, so
 * keep numbers stable and sequential down the page.
 */
export function SectionHead({ n, title, subtitle, className }: SectionHeadProps) {
  return (
    <div
      className={["section-head", subtitle ? "has-sub" : null, className].filter(Boolean).join(" ")}
    >
      <div className="section-head-top">
        <span className="n">{n}</span>
        <h2>{title}</h2>
      </div>
      {subtitle ? <div className="section-head-sub">{subtitle}</div> : null}
    </div>
  );
}
