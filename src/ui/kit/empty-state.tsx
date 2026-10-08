import { clsx } from "clsx";
import type { ReactNode } from "react";

type EmptyStateProps = {
  /** One true sentence about why there is nothing here. */
  title: string;
  /** What is true instead: "11 shipments in your perimeter are moving as planned." */
  children?: ReactNode;
  /** At most one action. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div className={clsx("flex max-w-xl flex-col items-start gap-1 px-6 py-10", className)}>
      <p className="text-base font-medium">{title}</p>
      {children && <p className="text-sm text-ink-600">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
