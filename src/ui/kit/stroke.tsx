import { clsx } from "clsx";
import { assertNever } from "./assert-never";
import type { ProvenanceKind } from "./provenance";

/** A committed date is a promise, not a stretch of the journey: it has no stroke. */
export type StrokeKind = Exclude<ProvenanceKind, "committed">;

type StrokeStyle = {
  width: 1 | 2;
  color: string;
  dash?: string;
  round?: true;
};

function strokeStyle(kind: StrokeKind): StrokeStyle {
  switch (kind) {
    case "confirmed":
      return { width: 2, color: "text-ink-900" };
    case "declared":
      return { width: 2, color: "text-ink-900", dash: "6 4" };
    case "estimated":
      return { width: 2, color: "text-ai-600", dash: "0.01 6", round: true };
    case "planned":
      return { width: 1, color: "text-ink-500" };
    default:
      return assertNever(kind);
  }
}

type StrokeProps = {
  kind: StrokeKind;
  /** Leads to a value that newer information has overtaken: same pattern, thin and grey. */
  muted?: boolean;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

/**
 * The chart's line language: solid for what happened, dashed for what an operator declared,
 * dotted for what the model says, a hairline for the plan. It fills its container along the
 * main axis, so the caller sets the length. As an SVG it does not stretch between a top and
 * a bottom: wrap a vertical stroke in a positioned element to size it that way.
 */
export function Stroke({
  kind,
  muted = false,
  orientation = "horizontal",
  className,
}: StrokeProps) {
  const style = strokeStyle(kind);
  const { dash, round } = style;
  const width = muted ? 1 : style.width;
  const color = muted ? "text-ink-500" : style.color;
  const mid = width / 2;
  // A round cap extends half a stroke beyond the line end, so a dotted line starts inside.
  const start = round ? mid : 0;
  const horizontal = orientation === "horizontal";

  return (
    <svg
      aria-hidden="true"
      width={horizontal ? "100%" : width}
      height={horizontal ? width : "100%"}
      className={clsx("block shrink-0 overflow-visible", color, className)}
    >
      <line
        x1={horizontal ? start : mid}
        y1={horizontal ? mid : start}
        x2={horizontal ? "100%" : mid}
        y2={horizontal ? mid : "100%"}
        stroke="currentColor"
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap={round ? "round" : undefined}
        shapeRendering={round ? undefined : "crispEdges"}
      />
    </svg>
  );
}
