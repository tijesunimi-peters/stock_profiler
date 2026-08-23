import { AppFooter } from "@clearyfi/design-prototype";

/** The standing footer, with the tagline that states what the product is. */
export function Standard() {
  return (
    <AppFooter
      tagline="Structured SEC data, normalised. Never a recommendation."
      links={[
        { label: "Methodology", href: "/methodology" },
        { label: "Coverage", href: "/coverage" },
        { label: "API reference", href: "/docs/api" },
        { label: "Data sources", href: "/sources" },
      ]}
    />
  );
}
