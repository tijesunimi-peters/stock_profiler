import * as React from 'react';

/**
 * StatusChip — from @clearyfi/design-prototype@0.1.0.
 */
export interface StatusChipProps {
  /** Which of the four statuses this value carries. */
  status: "ok" | "approximate" | "na" | "nm";
  /** Hide the text tag and show only the glyph. Use sparingly — the label is half the signal. */
  glyphOnly?: boolean;
  className?: string;
}

export declare const StatusChip: React.ComponentType<StatusChipProps>;
