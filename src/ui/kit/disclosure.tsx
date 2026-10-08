"use client";

import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
import { Collapsible } from "radix-ui";
import { type ComponentProps, createContext, type ReactNode, use, useState } from "react";

const OpenContext = createContext(false);

/** Shows more on demand, in place: the chain behind an estimate, an operator's raw message. */
export function Disclosure({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ComponentProps<typeof Collapsible.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  return (
    <OpenContext value={open}>
      <Collapsible.Root
        {...props}
        open={open}
        onOpenChange={(next) => {
          setUncontrolledOpen(next);
          onOpenChange?.(next);
        }}
      />
    </OpenContext>
  );
}

type DisclosureTriggerProps = Omit<ComponentProps<typeof Collapsible.Trigger>, "children"> & {
  children: ReactNode;
  /** Replaces the label while the content is open: "Hide original". */
  openLabel?: ReactNode;
};

export function DisclosureTrigger({
  children,
  openLabel,
  className,
  ...props
}: DisclosureTriggerProps) {
  const open = use(OpenContext);

  return (
    <Collapsible.Trigger
      {...props}
      className={clsx(
        "inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-brand-700 underline-offset-4 hover:underline",
        className,
      )}
    >
      <ChevronRight
        aria-hidden="true"
        className={clsx("size-3.5 transition-transform", open && "rotate-90")}
      />
      {open && openLabel !== undefined ? openLabel : children}
    </Collapsible.Trigger>
  );
}

export const DisclosureContent = Collapsible.Content;
