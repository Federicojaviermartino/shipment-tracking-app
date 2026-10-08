import { clsx } from "clsx";
import type { ReactNode } from "react";

type KeyValueListProps = {
  className?: string;
  children: ReactNode;
};

/** References and facts as a description list: labels left, values right. */
export function KeyValueList({ className, children }: KeyValueListProps) {
  return (
    <dl className={clsx("grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm", className)}>
      {children}
    </dl>
  );
}

type KeyValueProps = {
  label: string;
  /** Sets the value in the mono face: something the reader copies or compares. */
  mono?: boolean;
  children: ReactNode;
};

export function KeyValue({ label, mono = false, children }: KeyValueProps) {
  return (
    <div className="contents">
      <dt className="text-ink-600">{label}</dt>
      <dd className={clsx("min-w-0 break-words", mono && "font-mono text-xs/5")}>{children}</dd>
    </div>
  );
}
