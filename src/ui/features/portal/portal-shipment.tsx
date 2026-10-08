import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { PortalShipmentView } from "@/application/views";
import type { Instant } from "@/domain/time";
import { DESK } from "./desk";
import { PORTAL_HOME } from "./links";
import { NoticeCard } from "./notice-card";
import { ShipmentDocuments } from "./shipment-documents";
import { ShipmentHero } from "./shipment-hero";
import { ShipmentJourney } from "./shipment-journey";
import { ShipmentReferences } from "./shipment-references";

type PortalShipmentProps = {
  shipment: PortalShipmentView;
  now: Instant;
};

/** One shipment for its customer: the verdict first, then what they were told, then the proof. */
export function PortalShipment({ shipment, now }: PortalShipmentProps) {
  return (
    <div className="text-base">
      <Link
        href={PORTAL_HOME}
        className="inline-flex h-7 items-center gap-1.5 rounded-sm text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Your shipments
      </Link>
      <div className="mt-3 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ShipmentHero shipment={shipment} now={now} />
          {shipment.notices.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              verdictLabel={shipment.verdictLabel}
              now={now}
            />
          ))}
          <ShipmentJourney shipment={shipment} now={now} />
        </div>
        <aside aria-label="Documents and references" className="flex min-w-0 flex-col gap-6">
          <ShipmentDocuments shipment={shipment} />
          <ShipmentReferences shipment={shipment} />
          <p className="px-4 text-sm text-ink-600">
            Questions?{" "}
            <a href={`mailto:${DESK.email}`} className="font-medium text-brand-700 underline">
              {DESK.email}
            </a>
          </p>
        </aside>
      </div>
    </div>
  );
}
