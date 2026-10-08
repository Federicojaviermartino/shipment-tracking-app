import { clsx } from "clsx";
import type { StatusKind } from "./status-glyph";

const COLOR: Record<StatusKind, string> = {
  on_time: "bg-ontime-600",
  at_risk: "bg-atrisk-600",
  delayed: "bg-delayed-600",
  held: "bg-held-700",
  stale: "bg-stale-600",
  delivered: "bg-delivered-700",
  neutral: "bg-ink-400",
};

type StatusBarProps = {
  status: StatusKind;
  className?: string;
};

/**
 * The 3px bar on the left edge of a flagged card or a toast. It repeats a status that the
 * content states in words; the parent must be `relative` and clip its corners.
 */
export function StatusBar({ status, className }: StatusBarProps) {
  return (
    <span
      aria-hidden="true"
      className={clsx("absolute inset-y-0 left-0 w-[3px]", COLOR[status], className)}
    />
  );
}
