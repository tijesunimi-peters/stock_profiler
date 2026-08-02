Masthead from @clearyfi/design-prototype. Use via `window.ClearyFiDS.Masthead` (bundle loaded from the root `_ds_bundle.js`).

The page header (STYLE_GUIDE §4.3): title → right-aligned mono meta → a single hairline rule
→ optional intro copy.

Every data page opens with one. The meta column is where filing age and coverage caveats
live, which is why it sits at the top rather than in a footnote.

## Props

```ts
interface MastheadProps {
  /** Page title — Hanken 800, the largest type on the page. */
  title: string;
  /** Right-aligned mono meta lines. **State the as-of date here** — data is as of the latest filing, never real-time (STYLE_G */
  meta?: string[];
  /** Optional intro paragraph below the rule. */
  lede?: string;
  /** Mono accent kicker above the title. Omitted by default — inside the app shell the sidebar already brands the page, so an */
  eyebrow?: string;
  className?: string;
}
```
