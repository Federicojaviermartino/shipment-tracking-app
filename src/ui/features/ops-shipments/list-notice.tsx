import type { ReactNode } from "react";
import { EmptyState } from "@/ui/kit/empty-state";

type ListNoticeProps = {
  /** One true sentence about why there are no rows. */
  title: string;
  /** What is true instead. */
  children?: ReactNode;
  /** At most one action. */
  action?: ReactNode;
};

/** What stands where the table would be when there is nothing to list. */
export function ListNotice({ title, children, action }: ListNoticeProps) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState title={title} action={action}>
        {children}
      </EmptyState>
    </div>
  );
}
