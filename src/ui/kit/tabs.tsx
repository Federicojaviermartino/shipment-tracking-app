"use client";

import { clsx } from "clsx";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

/** Underline tabs with arrow-key roving. Control them with `value` and `onValueChange`. */
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

type TabListProps = ComponentProps<typeof TabsPrimitive.List> & {
  /** Names the set of views for assistive technology. */
  label: string;
};

export function TabList({ label, className, ...props }: TabListProps) {
  return (
    <TabsPrimitive.List
      {...props}
      aria-label={label}
      className={clsx("flex h-10 gap-6 border-b border-line", className)}
    />
  );
}

type TabProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** A count after the label: "Needs attention 6". */
  count?: ReactNode;
};

export function Tab({ count, className, children, ...props }: TabProps) {
  return (
    <TabsPrimitive.Trigger
      {...props}
      className={clsx(
        // The 2px underline sits on the list's hairline, so the tab overlaps it by a pixel.
        "group -mb-px inline-flex h-10 cursor-pointer items-center gap-2 rounded-t-sm border-b-2 border-transparent text-sm font-medium whitespace-nowrap text-ink-600 transition-colors hover:text-ink-900 data-[state=active]:border-ink-900 data-[state=active]:text-ink-900",
        className,
      )}
    >
      {children}
      {count != null && (
        <span className="font-normal text-ink-500 tabular-nums group-data-[state=active]:text-ink-700">
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabPanel({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content {...props} className={clsx("pt-4", className)} />;
}
