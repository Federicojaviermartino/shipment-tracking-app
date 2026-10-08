import type { Metadata } from "next";
import { OpsShipmentsScreen } from "@/ui/features/ops-shipments/ops-shipments-screen";

export const metadata: Metadata = { title: "Shipments" };

// Rendered in the browser only, where the data lives: there is no server render of this segment
// for the instant-navigation check to look at.
export const instant = false;

export default function OpsShipmentsPage() {
  return <OpsShipmentsScreen />;
}
