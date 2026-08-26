/**
 * The read hook every view uses.
 *
 * It is async on purpose even though nothing crosses the network yet: when `data/api.ts` is
 * repointed at the real endpoints, no view changes. It also means the loading and error states
 * are exercised now rather than discovered at plumbing time.
 */
import { useEffect, useRef, useState } from "react";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseApiOptions {
  /**
   * Hold the read until this turns true — how a section defers its fetch until the reader is
   * approaching it (see `useInView`). Defaults to `true`, so every existing call site is
   * unaffected. While false the resource stays `{ data: null, loading: true }`: not started and
   * not ready read the same to a caller showing a placeholder.
   */
  enabled?: boolean;
}

export function useApi<T>(
  load: () => Promise<T>,
  deps: unknown[],
  opts: UseApiOptions = {},
): Resource<T> {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<Resource<T>>({ data: null, loading: true, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState((s) => ({ data: s.data, loading: true, error: null }));
    loadRef
      .current()
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((error) => live && setState({ data: null, loading: false, error }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return state;
}

/**
 * Has `ref`'s element come within `rootMargin` of the viewport yet?
 *
 * **Latches.** Once true it never goes back, which is the whole point: a section that scrolls
 * out of view must not discard its data and refetch when the reader scrolls back. The observer
 * disconnects on the first hit.
 *
 * The default margin fires the read a few hundred pixels *before* the section is visible, so the
 * data is usually there by the time the reader arrives. Triggering exactly on entry would mean a
 * visible loading state on nearly every section.
 */
export function useInView({ rootMargin = "400px 0px" }: { rootMargin?: string } = {}): [
  (el: Element | null) => void,
  boolean,
] {
  const [seen, setSeen] = useState(false);
  // A CALLBACK ref, not `useRef`, and that is load-bearing. Views gate their first render on an
  // identity read, so on the render where this hook first runs the observed element does not
  // exist yet. An object ref would be null in that effect and nothing would ever re-run it —
  // the observer would never be created and the section would stay pending forever. React calls
  // a callback ref when the node actually mounts, which re-renders and re-runs the effect.
  const [node, setNode] = useState<Element | null>(null);

  useEffect(() => {
    if (seen || !node) return;
    // No IntersectionObserver (old browser, jsdom): load immediately rather than leaving the
    // section permanently blank.
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, rootMargin, seen]);

  return [setNode, seen];
}

/**
 * Which of `ids` is the section currently being read.
 *
 * The rail's jump list is only navigation if it also reports position — a list of eight links
 * with nothing marked is a menu, not a map. Picks the last heading above the fold line so the
 * highlight changes as a section's header crosses it, not when its bottom does.
 */
export function useScrollSpy(ids: string[], offset = 120): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;
    const onScroll = () => {
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key, offset]);

  return active;
}
