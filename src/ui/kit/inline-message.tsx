import { clsx } from "clsx";
import type { ComponentProps } from "react";
import { AlertGlyph } from "./alert-glyph";

/**
 * A sentence the user has to read before going on: a value that cannot be accepted, a draft
 * that failed or went out of date. It has no left rule, which belongs to what a model wrote.
 * Give it a `role` where it appears without the user having asked for it.
 */
export function InlineMessage({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p
      {...props}
      className={clsx(
        "flex items-start gap-2 rounded-sm bg-sunken px-3 py-2 text-sm font-medium",
        className,
      )}
    >
      <AlertGlyph className="mt-1" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
