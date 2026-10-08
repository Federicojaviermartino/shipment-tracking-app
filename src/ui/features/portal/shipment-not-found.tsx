import Link from "next/link";
import { buttonStyles } from "@/ui/kit/button-styles";
import { PORTAL_HOME } from "./links";

/**
 * One answer for a shipment that does not exist and for one that belongs to another customer:
 * the page must not reveal which.
 */
export function ShipmentNotFound() {
  return (
    <div className="flex flex-col items-start gap-4 text-base">
      <h1 className="text-2xl font-semibold">We couldn&apos;t find that shipment.</h1>
      <Link href={PORTAL_HOME} className={buttonStyles({ size: "lg" })}>
        Back to your shipments
      </Link>
    </div>
  );
}
