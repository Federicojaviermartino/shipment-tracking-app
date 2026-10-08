"use client";

import { useId } from "react";
import type { PortalShipmentView } from "@/application/views";
import type { Instant } from "@/domain/time";
import { Card } from "@/ui/kit/card";
import { LegTimeline } from "@/ui/kit/leg-timeline";
import { RouteStrip } from "@/ui/kit/route-strip";
import { consigneeClock, customerTimeline } from "./customer-timeline";
import { routeStripProps } from "./route-strip-props";
import { useMediaQuery } from "./use-media-query";

type ShipmentJourneyProps = {
  shipment: PortalShipmentView;
  now: Instant;
};

/** The proof under the verdict: where the cargo is on its route, then every milestone. */
export function ShipmentJourney({ shipment, now }: ShipmentJourneyProps) {
  const headingId = useId();
  // The clock on the "Now" rule never wraps: on a phone it would push the page sideways.
  const roomForClock = useMediaQuery("(min-width: 40rem)");
  const timeline = customerTimeline(
    shipment,
    roomForClock ? consigneeClock(shipment, now) : undefined,
  );
  const bySea = shipment.route.legs.some((leg) => leg.mode === "sea");

  return (
    <Card as="section" density="customer" aria-labelledby={headingId} className="max-sm:p-4">
      <h2 id={headingId} className="text-label">
        Route to {shipment.consignee}
      </h2>
      {/* The strip needs room for its place names: on a phone it scrolls instead of crushing them. */}
      <div className="mt-4 overflow-x-auto">
        <RouteStrip
          variant="full"
          {...routeStripProps(shipment.route, shipment.verdictLabel)}
          className="min-w-[30rem]"
        />
      </div>
      <div className="mt-6">
        <LegTimeline
          audience="customer"
          mode={bySea ? "sea" : "road"}
          title="Milestones"
          detail="Each time is local to its place"
          entries={timeline.entries}
          now={timeline.now}
        />
      </div>
    </Card>
  );
}
