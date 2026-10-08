"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { portalQueries } from "@/ui/hooks/queries";
import { usePortalSession } from "@/ui/shell/session";
import { NoticeAnnouncer } from "./notice-announcer";
import { PortalLoadError } from "./portal-load-error";
import { PortalShipment } from "./portal-shipment";
import { PortalSkeleton } from "./portal-skeleton";
import { ShipmentNotFound } from "./shipment-not-found";

export function PortalShipmentScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { estela, actor, now } = usePortalSession();
  const { data: shipment, isError, refetch } = useQuery(portalQueries.shipment(estela, actor, id));

  return (
    <>
      {/* Keyed by person: another persona's notices are not news for this one. */}
      <NoticeAnnouncer key={actor.userId} notices={shipment?.notices} />
      {shipment ? (
        <PortalShipment shipment={shipment} now={now} />
      ) : shipment === null ? (
        <ShipmentNotFound />
      ) : isError ? (
        <PortalLoadError onRetry={() => void refetch()} />
      ) : (
        <PortalSkeleton label="Loading the shipment" />
      )}
    </>
  );
}
