import { CompositionStrip } from "@clearyfi/design-prototype";

/** Institutional ownership concentration — bands as parts of one whole. */
export function OwnershipConcentration() {
  return (
    <CompositionStrip
      segments={[
        { label: "Vanguard", share: 0.089 },
        { label: "BlackRock", share: 0.071 },
        { label: "State Street", share: 0.041 },
        { label: "Next 7 holders", share: 0.216 },
        { label: "All other 13F filers", share: 0.583 },
      ]}
    />
  );
}

/** Narrow bands push their labels to the legend rather than being clipped. */
export function WithNarrowBands() {
  return (
    <CompositionStrip
      insideLabelMin={0.12}
      segments={[
        { label: "Data Center", share: 0.782 },
        { label: "Gaming", share: 0.171 },
        { label: "Professional Visualization", share: 0.028 },
        { label: "Automotive", share: 0.019 },
      ]}
    />
  );
}
