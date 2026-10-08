import type { Metadata } from "next";
import { PortalShipmentScreen } from "@/ui/features/portal/portal-shipment-screen";

export const metadata: Metadata = { title: "Shipment" };

// Rendered in the browser only, where the data lives: there is no server render of this segment
// for the instant-navigation check to look at.
export const instant = false;

export default function PortalShipmentPage({ params }: PageProps<"/portal/shipments/[id]">) {
  return <PortalShipmentScreen params={params} />;
}
