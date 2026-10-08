import { clsx } from "clsx";
import type { ReactNode } from "react";
import { StatusGlyph } from "./status-glyph";

const TONE = {
  at_risk: "text-atrisk-700",
  delayed: "text-delayed-700",
} as const;

type DeltaProps = {
  /**
   * What the difference means for the committed date: `at_risk` when an estimate says it
   * will be missed, `delayed` when an operator has declared it. Leave it out where a status
   * pill beside it already says so, and for a difference that is not late.
   */
  status?: keyof typeof TONE;
  /** The measure as written: "+1 d", "−1 d", "same day". */
  children: ReactNode;
  className?: string;
};

/**
 * The difference between a date and the committed one. Outside a status pill, which has
 * its own qualifier, this is the one way that measure is printed.
 */
export function Delta({ status, children, className }: DeltaProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap tabular-nums",
        status ? TONE[status] : "text-ink-600",
        className,
      )}
    >
      {status && <StatusGlyph status={status} />}
      {children}
    </span>
  );
}
