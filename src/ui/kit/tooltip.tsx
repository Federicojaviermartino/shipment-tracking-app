"use client";

import { clsx } from "clsx";
import { Slot, Tooltip as TooltipPrimitive } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  use,
  useId,
} from "react";
import { overlaySurface } from "./overlay-surface";

const DELAY_MS = 300;

const SharedProvider = createContext(false);

/**
 * Lets the tooltips inside it share their timing: once one has been shown, the next opens
 * without the delay, which is what a reader moving down a column of them expects. Mount it
 * once per layout. A tooltip outside any provider still works, on its own timing.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <SharedProvider value>
      <TooltipPrimitive.Provider delayDuration={DELAY_MS}>{children}</TooltipPrimitive.Provider>
    </SharedProvider>
  );
}

type DescribedProps = {
  by: string;
  children: ReactElement;
};

// The trigger's props arrive here, among them an `aria-describedby` that points at the
// tooltip only while it is open. It is replaced by an element that is always there, and the
// tooltip itself is left out so that the same words are not read twice.
function Described({ by, children, ...trigger }: DescribedProps) {
  return (
    <Slot.Root {...trigger} aria-describedby={by}>
      {children}
    </Slot.Root>
  );
}

type TooltipProps = {
  content: ReactNode;
  /** The element the tooltip belongs to. It must be focusable. */
  children: ReactElement;
  /**
   * The content is something the reader must be able to find without opening the tooltip,
   * such as the reason a control is unavailable. It then describes the control at all
   * times, not only while the tooltip is shown.
   */
  describes?: boolean;
  side?: ComponentProps<typeof TooltipPrimitive.Content>["side"];
  align?: ComponentProps<typeof TooltipPrimitive.Content>["align"];
};

/** Explains a control on hover and on keyboard focus. */
export function Tooltip({
  content,
  children,
  describes = false,
  side = "top",
  align = "center",
}: TooltipProps) {
  const shared = use(SharedProvider);
  const descriptionId = useId();

  const tooltip = (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {describes ? <Described by={descriptionId}>{children}</Described> : children}
      </TooltipPrimitive.Trigger>
      {describes && (
        <span id={descriptionId} hidden>
          {content}
        </span>
      )}
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          // Any press closes a tooltip, except one that its target cancelled: an unavailable
          // control swallows the press and keeps its reason in view.
          onPointerDownOutside={(event) => {
            if (event.detail.originalEvent.defaultPrevented) {
              event.preventDefault();
            }
          }}
          className={clsx(overlaySurface, "max-w-xs px-3 py-2 text-xs")}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );

  return shared ? (
    tooltip
  ) : (
    <TooltipPrimitive.Provider delayDuration={DELAY_MS}>{tooltip}</TooltipPrimitive.Provider>
  );
}
