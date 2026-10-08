import type { Metadata } from "next";
import { OpsShipmentScreen } from "@/ui/features/ops-shipment/ops-shipment-screen";

export const metadata: Metadata = { title: "Shipment" };

// Rendered in the browser only, where the data lives: there is no server render of this segment
// for the instant-navigation check to look at.
export const instant = false;

export default function OpsShipmentPage({ params }: PageProps<"/ops/shipments/[id]">) {
  return <OpsShipmentScreen params={params} />;
}
