"use client";

import { clsx } from "clsx";
import type { ComponentProps } from "react";
import { useFlash } from "./use-flash";

type FlashItemProps = ComponentProps<"li"> & {
  /** Flashes the item once each time this changes after the item mounted. */
  flashKey?: string | number;
};

/**
 * A list item that can be pointed out: it flashes when `flashKey` changes, and under reduced
 * motion shows a bar instead, until it is hovered or focused.
 */
export function FlashItem({
  flashKey,
  className,
  onPointerEnter,
  onFocus,
  ...props
}: FlashItemProps) {
  const flash = useFlash(flashKey);

  return (
    <li
      {...props}
      onPointerEnter={(event) => {
        flash.see();
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        flash.see();
        onFocus?.(event);
      }}
      className={clsx(className, flash.animation, flash.unseen && "motion-reduce:brand-bar")}
    />
  );
}
