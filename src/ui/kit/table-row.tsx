"use client";

import { clsx } from "clsx";
import { type ComponentProps, useState } from "react";
import { useFlash } from "./use-flash";

type TableRowProps = ComponentProps<"tr"> & {
  /**
   * Names the row's latest change, for example the key of its newest event. Each time it
   * changes after the row mounted, the row flashes once in place; under reduced motion it
   * shows a bar instead, until it is hovered or focused.
   */
  flashKey?: string | number;
  /** The row is new to this list: a brand bar until it is hovered or focused. */
  fresh?: boolean;
};

/**
 * A 64px row. Make it clickable with one `link-stretched` link in a cell: every other
 * control in the row stays reachable above the stretched link without further classes.
 */
export function TableRow({
  flashKey,
  fresh = false,
  className,
  onPointerEnter,
  onFocus,
  ...props
}: TableRowProps) {
  const flash = useFlash(flashKey);
  const [freshSeen, setFreshSeen] = useState(false);
  if (!fresh && freshSeen) {
    setFreshSeen(false);
  }

  function see() {
    flash.see();
    if (fresh && !freshSeen) {
      setFreshSeen(true);
    }
  }

  return (
    <tr
      {...props}
      onPointerEnter={(event) => {
        see();
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        see();
        onFocus?.(event);
      }}
      className={clsx(
        "link-stretched-host h-16 transition-colors hover:bg-canvas",
        flash.animation,
        // The bar is drawn on the first cell: a row has no box of its own to carry it.
        fresh && !freshSeen
          ? "*:first:brand-bar"
          : flash.unseen && "motion-reduce:*:first:brand-bar",
        className,
      )}
    />
  );
}
