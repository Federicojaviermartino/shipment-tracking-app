import { clsx } from "clsx";
import type { ReactNode } from "react";

type SkeletonProps = {
  /** Stands in for a status pill instead of a block of text or a control. */
  pill?: boolean;
  /** The size, copied from the content the block stands in for. */
  className?: string;
};

/**
 * A placeholder block. It stays hidden for the first 150 ms so that a fast answer never
 * flickers, then pulses until the content replaces it.
 */
export function Skeleton({ pill = false, className }: SkeletonProps) {
  return (
    <span
      className={clsx(
        "block animate-skeleton bg-sunken",
        pill ? "rounded-full" : "rounded-sm",
        className,
      )}
    />
  );
}

type SkeletonGroupProps = {
  /** What is loading, for assistive technology: "Reading the shipment record…". */
  label: string;
  className?: string;
  children: ReactNode;
};

export function SkeletonGroup({ label, className, children }: SkeletonGroupProps) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
