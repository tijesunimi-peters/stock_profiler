import * as React from 'react';

/**
 * AppShell — from @clearyfi/design-prototype@0.1.0.
 */
export interface AppShellProps {
  /** Page content — usually a `Masthead` followed by sections. */
  children: React.ReactNode;
  /** Subject nav. Defaults to the product's seven subjects, three live and four planned. */
  subjects?: ShellSubject[];
  /** Subject-scoped actions (Compare · Screen · Coverage). */
  actions?: ShellSubject[];
  /** Placeholder for the global ticker/CIK search. */
  searchPlaceholder?: string;
  className?: string;
}

export declare const AppShell: React.ComponentType<AppShellProps>;
