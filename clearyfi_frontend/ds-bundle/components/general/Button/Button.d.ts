import * as React from 'react';

/**
 * Button — from @clearyfi/design-prototype@0.1.0.
 * @replaces button
 */
export interface ButtonProps {
  children: React.ReactNode;
  /** `primary` — terracotta fill, the one call to action. `outline` — hairline border on paper, for secondary actions. `inver */
  variant?: "primary" | "outline" | "inverse";
  /** Render as a link. Every href must resolve to a real route — never a placeholder. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export declare const Button: React.ComponentType<ButtonProps>;
