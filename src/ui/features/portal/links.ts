import type { ShipmentId } from "@/domain/shipment";

export const PORTAL_HOME = "/portal";

export function shipmentHref(id: ShipmentId) {
  return `${PORTAL_HOME}/shipments/${id}`;
}
