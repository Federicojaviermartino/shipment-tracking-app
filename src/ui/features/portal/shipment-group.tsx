import { type ReactNode, useId } from "react";

type ShipmentGroupProps = {
  title: string;
  count: number;
  children: ReactNode;
};

/** One group of the customer's list under its caps heading, with how many it holds. */
export function ShipmentGroup({ title, count, children }: ShipmentGroupProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-label">
        {title} · <span className="tabular-nums">{count}</span>
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
