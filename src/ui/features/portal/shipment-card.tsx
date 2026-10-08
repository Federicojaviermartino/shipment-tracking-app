import { clsx } from "clsx";
import Link from "next/link";
import type { PortalCard } from "@/application/views";
import type { Instant } from "@/domain/time";
import { Card } from "@/ui/kit/card";
import { RouteStrip } from "@/ui/kit/route-strip";
import { StatusPill } from "@/ui/kit/status-pill";
import { ENTRY_COLUMNS } from "./entry-columns";
import { LastUpdate } from "./last-update";
import { shipmentHref } from "./links";
import { PublishedDate } from "./published-date";
import { routeStripProps } from "./route-strip-props";
import { VERDICT_STATUS } from "./verdict-status";

type ShipmentCardProps = {
  shipment: PortalCard;
  now: Instant;
};

/** A shipment on the way: the customer's own order number first, and the whole card is its link. */
export function ShipmentCard({ shipment, now }: ShipmentCardProps) {
  return (
    <Card
      as="li"
      variant="interactive"
      density="customer"
      className={clsx("flex flex-col gap-3 text-base max-md:p-4 md:h-28 md:py-0", ENTRY_COLUMNS)}
    >
      <div className="min-w-0">
        <Link href={shipmentHref(shipment.id)} className="link-stretched font-semibold">
          Order {shipment.orderRef}
        </Link>
        <p className="truncate text-sm text-ink-600">{shipment.cargo}</p>
      </div>
      <div className="min-w-0">
        <RouteStrip variant="mini" {...routeStripProps(shipment.route, shipment.verdictLabel)} />
        <p className="mt-2 truncate text-sm">{shipment.stage.label}</p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <StatusPill status={VERDICT_STATUS[shipment.verdict]} size="md">
          {shipment.verdictLabel}
        </StatusPill>
        <p className="min-h-6">
          <PublishedDate published={shipment.published} />
        </p>
        <LastUpdate at={shipment.lastUpdateAt} now={now} className="text-xs text-ink-600" />
      </div>
    </Card>
  );
}
