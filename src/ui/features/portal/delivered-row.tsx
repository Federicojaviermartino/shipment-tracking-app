import { clsx } from "clsx";
import Link from "next/link";
import type { PortalCard } from "@/application/views";
import { StatusPill } from "@/ui/kit/status-pill";
import { ENTRY_COLUMNS } from "./entry-columns";
import { shipmentHref } from "./links";
import { PublishedDate } from "./published-date";
import { VERDICT_STATUS } from "./verdict-status";

/** A shipment that has arrived, on one line: there is nothing left to follow, only to look up. */
export function DeliveredRow({ shipment }: { shipment: PortalCard }) {
  return (
    <li
      className={clsx(
        "link-stretched-host flex flex-col gap-1 px-4 py-3 text-base transition-colors hover:bg-canvas md:min-h-14 md:px-6 md:py-0",
        ENTRY_COLUMNS,
      )}
    >
      <Link href={shipmentHref(shipment.id)} className="link-stretched font-semibold">
        Order {shipment.orderRef}
      </Link>
      <p className="truncate text-sm text-ink-600">{shipment.cargo}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill status={VERDICT_STATUS[shipment.verdict]}>{shipment.verdictLabel}</StatusPill>
        <PublishedDate published={shipment.published} />
      </p>
    </li>
  );
}
