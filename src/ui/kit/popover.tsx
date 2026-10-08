"use client";

import { clsx } from "clsx";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { overlaySurface } from "./overlay-surface";

export const Popover = PopoverPrimitive.Root;

/** Wrap the control that opens it: `<PopoverTrigger asChild><Button>…</Button></PopoverTrigger>`. */
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...props}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={clsx(overlaySurface, "p-4 text-sm", className)}
      />
    </PopoverPrimitive.Portal>
  );
}

/** The popover's heading. A popover is a dialog, and this is what gives it its name. */
export function PopoverTitle({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Title>) {
  return <PopoverPrimitive.Title {...props} className={clsx("font-semibold", className)} />;
}
