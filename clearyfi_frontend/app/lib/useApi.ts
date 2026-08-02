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

export function useApi<T>(load: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [state, setState] = useState<Resource<T>>({ data: null, loading: true, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
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
  }, deps);

  return state;
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
