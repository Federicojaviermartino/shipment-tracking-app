import { type ReactNode, useId } from "react";
import { Card } from "@/ui/kit/card";

type RailCardProps = {
  title: string;
  children: ReactNode;
};

/** One block of the shipment's rail under its caps heading. */
export function RailCard({ title, children }: RailCardProps) {
  const headingId = useId();

  return (
    <Card as="section" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-label">
        {title}
      </h2>
      {children}
    </Card>
  );
}
