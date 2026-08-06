import { useCallback, useEffect, useId, useRef, useState } from "react";

export interface Suggestion {
  ticker: string;
  cik: number;
  name?: string | null;
}

export interface SearchSuggestProps {
  placeholder?: string;
  /**
   * Resolves a query to suggestions. The component never fetches — it does not know the API
   * exists, which is what lets the design system stay presentational and the app own the seam.
   */
  onSearch: (query: string) => Promise<Suggestion[]>;
  /** A row was chosen, by click or by Enter on the highlighted row. */
  onPick: (s: Suggestion) => void;
  /** Debounce before a query is issued. 150ms is the static UI's value. */
  debounceMs?: number;
  /** Binds ⌘K / Ctrl-K to focus the input. */
  hotkey?: boolean;
}

/**
 * The global ticker/CIK typeahead, ported from the static UI's `suggest.js`.
 *
 * Four behaviours in the original are load-bearing and survive the port:
 *
 *  - **A sequence guard, not just a debounce.** Responses can land out of order, so a reply is
 *    dropped unless it belongs to the most recent request. Without it a slow "a" overwrites a
 *    fast "aapl".
 *  - **`mousedown`, not `click`.** The input's blur fires first and would tear the menu down
 *    before a click ever resolved.
 *  - **Blur closes on a delay**, so a pick in flight still completes.
 *  - **Escape closes the menu without clearing the input** — it dismisses the suggestion, not
 *    the thing you typed.
 */
export function SearchSuggest({
  placeholder = "Ticker or CIK…",
  onSearch,
  onPick,
  debounceMs = 150,
  hotkey = true,
}: SearchSuggestProps) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const seq = useRef(0);
  const listId = useId();

  /*
   * The callbacks live in refs so the query effect depends on the VALUE only.
   *
   * Callers pass inline arrows — `onSearch={(q) => api.suggest(q)}` — which get a fresh identity
   * on every parent render. With those in the dependency array the effect re-ran on each render,
   * bumping the sequence counter and discarding the reply that was already in flight: after any
   * navigation the request still fired and the menu never opened. A design-system component
   * should not require its callers to memoize.
   */
  const searchRef = useRef(onSearch);
  const pickRef = useRef(onPick);
  useEffect(() => {
    searchRef.current = onSearch;
    pickRef.current = onPick;
  });

  const close = useCallback(() => {
    setOpen(false);
    setItems([]);
    setActive(-1);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = value.trim();
    if (!q) {
      // Bump the sequence so an in-flight reply for the text just cleared cannot reopen the menu.
      seq.current++;
      close();
      return;
    }
    timer.current = setTimeout(() => {
      const mine = ++seq.current;
      searchRef.current(q)
        .then((next) => {
          if (mine !== seq.current) return;
          setItems(next);
          setActive(next.length ? 0 : -1);
          setOpen(next.length > 0);
        })
        .catch(() => {
          if (mine === seq.current) close();
        });
    }, debounceMs);
    return () => clearTimeout(timer.current);
  }, [value, debounceMs, close]);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  const pick = (i: number) => {
    const s = items[i];
    if (!s) return;
    close();
    setValue(s.ticker);
    pickRef.current(s);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <div className="shell-search">
      <span className="shell-search-ic" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={inputRef}
        className="shell-search-input"
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        /*
         * autoComplete="off" is not cosmetic: without it the browser shows its OWN saved-value
         * dropdown over ours on focus and on page load, which reads as our menu opening by
         * itself. The static input carried it for the same reason.
         */
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        // A delay, so mousedown on a row still lands before the menu goes.
        onBlur={() => setTimeout(close, 120)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      />
      <span className="shell-kbd">⌘K</span>

      {open && (
        <div className="suggest-menu" id={listId} role="listbox">
          {items.map((s, i) => (
            <div
              key={`${s.ticker}-${s.cik}`}
              id={`${listId}-${i}`}
              className={`suggest-item${i === active ? " active" : ""}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseMove={() => setActive(i)}
            >
              <span className="suggest-ticker">{s.ticker}</span>
              <span className="suggest-name">{s.name ?? ""}</span>
              <span className="suggest-cik">CIK {s.cik}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
