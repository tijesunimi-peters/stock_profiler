StateBlock from @clearyfi/design-prototype. Use via `window.ClearyFiDS.StateBlock` (bundle loaded from the root `_ds_bundle.js`).

The four shared non-data states (STYLE_GUIDE §6).

The `empty` copy matters more than it looks: **empty is not "nothing was filed"**. Coverage
has real floors (XBRL from ~2009–2012, 13D/G structured XML from ~mid-2025), and a state
that silently implies absence of filings rather than absence of coverage is a lie by layout.

## Props

```ts
interface StateBlockProps {
  /** `loading` — pulsing accent dot + shimmer, with a note when the path may be cold. `empty` — a filing is on record but not */
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
```
