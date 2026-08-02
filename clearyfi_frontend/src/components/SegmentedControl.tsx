export interface SegmentedControlOption {
  /** Stable key returned to `onChange`. */
  value: string;
  /** Visible label — keep it short; the control is mono and does not wrap. */
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  /** The currently active option's `value`. */
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}

/**
 * The period / view switcher (STYLE_GUIDE §4.6): 1.5px border, 8px radius, active segment
 * filled terracotta with white text.
 *
 * Use it for a small set of mutually exclusive views — fiscal period, statement type, window
 * length. Beyond about five options it stops scanning well; use the view rail instead.
 */
export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  return (
    <div className={["segmented", className].filter(Boolean).join(" ")} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={opt.value === value ? "on" : undefined}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
