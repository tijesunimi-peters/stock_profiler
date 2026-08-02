AppFooter from @clearyfi/design-prototype. Use via `window.ClearyFiDS.AppFooter` (bundle loaded from the root `_ds_bundle.js`).

The page footer: a thin rule, mono accent links to real routes, and the standing tagline.

Every link resolves — placeholder hrefs are forbidden (STYLE_GUIDE §10).

## Props

```ts
interface AppFooterProps {
  links?: FooterLink[];
  /** Muted right-aligned tagline. */
  tagline?: string;
  className?: string;
}
```
