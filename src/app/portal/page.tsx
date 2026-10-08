import type { Metadata } from "next";
import { PortalHomeScreen } from "@/ui/features/portal/portal-home-screen";

export const metadata: Metadata = { title: "Your shipments" };

// Rendered in the browser only, where the data lives: there is no server render of this segment
// for the instant-navigation check to look at.
export const instant = false;

export default function PortalHomePage() {
  return <PortalHomeScreen />;
}
