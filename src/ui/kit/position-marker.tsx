import { clsx } from "clsx";
import type { CSSProperties } from "react";

type PositionMarkerProps = {
  /** The last position known, not the current one: the marker turns hollow. */
  stale?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Where the cargo is, on the route strip and on the timeline's rail: a 12px dot with a halo. */
export function PositionMarker({ stale = false, className, style }: PositionMarkerProps) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={clsx(
        "block size-3 rounded-full",
        stale ? "border-2 border-brand-600 bg-surface" : "bg-brand-600 ring-2 ring-brand-200",
        className,
      )}
    />
  );
}
