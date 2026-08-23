import { Button } from "@clearyfi/design-prototype";

/** The three variants — one call to action, secondary, and inverse for dark ground. */
export function Variants() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Button variant="primary">Compare filers</Button>
      <Button variant="outline">Download CSV</Button>
      <Button variant="inverse">API reference</Button>
    </div>
  );
}

/** As a link — every href resolves to a real route. */
export function AsLink() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Button variant="primary" href="/companies/AAPL/statements">
        View statements
      </Button>
      <Button variant="outline" href="/methodology">
        How this is built
      </Button>
    </div>
  );
}
