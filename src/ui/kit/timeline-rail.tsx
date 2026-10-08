import { clsx } from "clsx";
import type { Audience } from "./provenance";
import { Stroke, type StrokeKind } from "./stroke";

/** The three columns of a timeline row: time, rail, text. A customer's dates are set larger. */
export const TIMELINE_GRID: Record<Audience, string> = {
  ops: "grid grid-cols-[8rem_1.5rem_minmax(0,1fr)] gap-x-3",
  customer: "grid grid-cols-[9rem_1.5rem_minmax(0,1fr)] gap-x-3",
};

/**
 * How the rail is drawn between two timeline rows: the stroke of the provenance it leads
 * into, a hatched band where nothing is known, or nothing at the ends of a section. A
 * stroke that leads into an overtaken value is muted, so that it never outweighs the live
 * one next to it.
 */
export type Rail = {
  stretch: StrokeKind | "unknown" | "none";
  muted?: boolean;
};

export const NO_RAIL: Rail = { stretch: "none" };

type RailLineProps = {
  rail: Rail;
  /** Vertical extent inside the 24px rail column, as position utilities. */
  className: string;
};

export function RailLine({ rail, className }: RailLineProps) {
  const { stretch, muted = false } = rail;

  if (stretch === "none") {
    return null;
  }
  if (stretch === "unknown") {
    // A hatched track where the solid one would be, wide enough for the hatch to read at
    // its real size. Nothing is printed on it, so the hatch is at full strength.
    return (
      <span
        aria-hidden="true"
        className={clsx(
          "absolute left-[7px] w-2.5 border-x border-stale-600 bg-stale-50 bg-hatch [--hatch-ink:var(--color-stale-600)]",
          className,
        )}
      />
    );
  }
  // The stroke is an SVG, which would not stretch between a top and a bottom on its own.
  const hairline = muted || stretch === "planned";
  return (
    <span className={clsx("absolute", hairline ? "left-3" : "left-[11px]", className)}>
      <Stroke kind={stretch} muted={muted} orientation="vertical" />
    </span>
  );
}
