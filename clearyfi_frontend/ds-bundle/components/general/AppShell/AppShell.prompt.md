AppShell from @clearyfi/design-prototype. Use via `window.ClearyFiDS.AppShell` (bundle loaded from the root `_ds_bundle.js`).

The one product shell every data page lives in (STYLE_GUIDE §4.2, §5): a fixed subject
sidebar and a sticky topbar carrying the global search.

The sidebar names **the entity you are analysing** — the claim that the product is
entity-centric rather than report-centric. There is exactly one shell; do not build a second
nav for a new page.

## Props

```ts
interface AppShellProps {
  /** Page content — usually a `Masthead` followed by sections. */
  children: React.ReactNode;
  /** Subject nav. Defaults to the product's seven subjects, three live and four planned. */
  subjects?: ShellSubject[];
  /** Subject-scoped actions (Compare · Screen · Coverage). */
  actions?: ShellSubject[];
  /** Placeholder for the global ticker/CIK search. */
  searchPlaceholder?: string;
  className?: string;
}
```
