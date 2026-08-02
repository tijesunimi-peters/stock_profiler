Button from @clearyfi/design-prototype. Use via `window.ClearyFiDS.Button` (bundle loaded from the root `_ds_bundle.js`).

The action control, in the three shipped treatments (STYLE_GUIDE §4.6–4.7).

Terracotta is the only chromatic accent for interactive elements — do not introduce a second
accent hue for a different action, and never use the favorability trio here.

## Props

```ts
interface ButtonProps {
  children: React.ReactNode;
  /** `primary` — terracotta fill, the one call to action. `outline` — hairline border on paper, for secondary actions. `inver */
  variant?: "primary" | "outline" | "inverse";
  /** Render as a link. Every href must resolve to a real route — never a placeholder. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}
```
