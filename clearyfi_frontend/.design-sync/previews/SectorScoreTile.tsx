import { SectorScoreTile } from "@clearyfi/design-prototype";

/** A composite theme score — a position relative to other sectors, never a grade. */
export function Profitability() {
  return (
    <SectorScoreTile
      sector="Semiconductors & related devices"
      score={78}
      theme="Profitability"
      direction="up"
      delta="+4.2"
      coverage="118 filers"
    />
  );
}

/** A low score reads as position, not failure — the tile never implies a verdict. */
export function LowerPosition() {
  return (
    <SectorScoreTile
      sector="Air transportation, scheduled"
      score={31}
      theme="Profitability"
      direction="down"
      delta="−2.6"
      coverage="24 filers"
    />
  );
}

/** Flat, with no delta emphasis. */
export function Flat() {
  return (
    <SectorScoreTile
      sector="National commercial banks"
      score={54}
      theme="Solvency"
      direction="flat"
      delta="0.0"
      coverage="212 filers"
    />
  );
}
