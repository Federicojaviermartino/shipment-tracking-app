import type { PortalCard } from "@/application/views";
import type { Instant } from "@/domain/time";
import { ShipmentCard } from "./shipment-card";

type ShipmentListProps = {
  shipments: readonly PortalCard[];
  now: Instant;
};

export function ShipmentList({ shipments, now }: ShipmentListProps) {
  return (
    <ul className="flex flex-col gap-4">
      {shipments.map((shipment) => (
        <ShipmentCard key={shipment.id} shipment={shipment} now={now} />
      ))}
    </ul>
  );
}
