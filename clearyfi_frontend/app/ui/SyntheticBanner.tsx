/**
 * The standing disclosure: nothing on this page came from a filing.
 *
 * ## Why it exists
 *
 * `data/api.ts` has always declared `PROVENANCE = { synthetic: true, … }` and **nothing ever
 * imported it**. `app/README.md` claimed "a standing banner says so at the top of every page";
 * there was no banner. Every figure in this app is generated from a hash of the ticker, and until
 * now the app said so nowhere a reader would see.
 *
 * That was survivable while this was a prototype. It stops being survivable now that the app is
 * the product frontend (operator ruling, 2026-08-02).
 *
 * ## Why it lists surfaces instead of just warning
 *
 * The banner is a COUNTDOWN TO ITS OWN DELETION. It names the surfaces still running on synthetic
 * figures, so as each one is plumbed onto real endpoints the list shrinks — and when the last one
 * lands it renders `null` and the banner is *gone*, not merely quiet.
 *
 * That is not a flourish; it is the mechanism that proved the equivalent claim in the
 * server-rendered app. V3-P5a's `ipBanner()` named the sections still on prototype values, and the
 * banner's DISAPPEARANCE was the evidence the phase was complete — a green report can be written
 * about anything, but a banner that is still rendering cannot be argued with.
 *
 * ## Why it borrows the extension-tag palette rather than introducing a colour
 *
 * `--ext-*` already means one specific thing here: a value that came from a company's own
 * extension tag rather than the standard taxonomy — *read this differently from the rest*. A
 * synthetic figure is the same instruction, louder. Adding a sixth accent for it would have made
 * the vocabulary less legible, not more. The design system has no "danger" token, and inventing
 * one for a banner scheduled for deletion would be the wrong thing to leave behind.
 */
import { PROVENANCE } from "../data/api";

export function SyntheticBanner() {
  const surfaces = PROVENANCE.syntheticSurfaces;
  // The whole point: no surfaces left, no banner. Not hidden, not greyed — absent.
  if (!surfaces.length) return null;

  return (
    <div className="synth-banner" role="note">
      <span className="synth-banner-eyebrow">Synthetic</span>
      <span className="synth-banner-copy">
        No figure on this page comes from an SEC filing. Values are generated from the ticker and
        are stable, plausible, and wrong.
      </span>
      <span className="synth-banner-list">
        {surfaces.length} {surfaces.length === 1 ? "surface" : "surfaces"}: {surfaces.join(" · ")}
      </span>
    </div>
  );
}
