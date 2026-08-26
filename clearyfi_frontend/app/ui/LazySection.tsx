import type { ReactNode } from "react";
import { StateBlock } from "@ds";
import type { Resource } from "../lib/useApi";

export interface LazySectionProps<T> {
  /**
   * The callback ref from `useInView`. A callback rather than an object ref because the view
   * gates its first render, so the node does not exist when the hook first runs.
   */
  innerRef: (el: Element | null) => void;
  read: Resource<T>;
  /**
   * Further reads this section needs before it can render. The typed `read` above is the one
   * handed to `children`; these are gated on but rebound by the caller, which is how a section
   * that draws on two endpoints (HubOverview's §02 needs financials AND footnotes) waits for
   * both without the component having to be generic over a tuple.
   */
  also?: Resource<unknown>[];
  /**
   * Space to hold while the section is pending, in px.
   *
   * **Load-bearing.** A zero-height placeholder lets the page grow as sections resolve, which
   * shoves everything below them down under the reader mid-scroll — worse than the all-or-nothing
   * gate this replaces. Set it near the section's real height; it only has to be close enough
   * that the correction is not felt.
   */
  minHeight: number;
  /** What the section says while it waits. */
  pendingCopy?: string;
  children: (data: T) => ReactNode;
}

/**
 * One section's body, rendered when that section's own read lands.
 *
 * Wraps the CONTENT only — the numbered heading stays a sibling in the view and renders eagerly.
 * That is deliberate: `useScrollSpy` resolves sections with `document.getElementById(id)`, so a
 * deferred heading would leave the rail with nothing to find and no way to report position.
 *
 * Errors are contained here. One failed read paints this section and no other, where the
 * all-or-nothing gate it replaces blanked the whole view — the same reasoning `SectorRail`
 * already applies to its own two reads.
 */
export function LazySection<T>({
  innerRef,
  read,
  also = [],
  minHeight,
  pendingCopy = "Reading this section.",
  children,
}: LazySectionProps<T>) {
  const all = [read, ...also];
  const failed = all.find((r) => r.error);
  const ready = read.data !== null && also.every((r) => r.data !== null);
  return (
    <div ref={innerRef} style={ready ? undefined : { minHeight }}>
      {failed ? (
        <StateBlock variant="error" copy={failed.error!.message} />
      ) : ready ? (
        children(read.data as T)
      ) : (
        <StateBlock variant="loading" copy={pendingCopy} />
      )}
    </div>
  );
}
