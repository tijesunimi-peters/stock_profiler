import { StateBlock } from "@clearyfi/design-prototype";

/** Loading, with the cold-path note for a first request that may be slow. */
export function Loading() {
  return (
    <StateBlock
      variant="loading"
      coldNote="First request for this filer fetches from SEC and may take a few seconds."
    />
  );
}

/** Empty — a filing is on record, but this section has nothing tagged in it. */
export function Empty() {
  return (
    <StateBlock
      variant="empty"
      title="No segments disclosed"
      copy="This filer's latest 10-K does not tag reportable segments under ASC 280. That is an absence in the filing, not a gap in our coverage."
    />
  );
}

/** Not found, with real routes to somewhere useful. */
export function NotFound() {
  return (
    <StateBlock
      variant="notFound"
      title="No filer matches that ticker"
      copy="The symbol may be delisted, or it may file under a different registrant name."
      recovery={[
        { label: "Browse companies", href: "/companies" },
        { label: "Coverage", href: "/coverage" },
      ]}
    />
  );
}

/** Error — says what happened and what the reader can do. */
export function ErrorState() {
  return (
    <StateBlock
      variant="error"
      copy="SEC EDGAR did not respond in time. The request was not retried automatically; reload to try again."
    />
  );
}
