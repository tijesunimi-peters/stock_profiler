import { StateBlock } from "@ds";
import { useSelection } from "../state";
import { PageShell } from "../ui/Shell";

export function NotFoundPage() {
  const sel = useSelection();
  return (
    <PageShell
      subject="home"
      title="Not found"
      disclosures={["No data is shown on this page."]}
    >
      <StateBlock
        variant="notFound"
        copy="That route does not exist in this app."
        recovery={[
          { label: "Sector analytics", href: sel.href("/sectors") },
          { label: `Company · ${sel.focal}`, href: sel.href(`/company/${sel.focal}`) },
          { label: "Compare sectors", href: sel.href("/compare/sectors") },
        ]}
      />
    </PageShell>
  );
}
