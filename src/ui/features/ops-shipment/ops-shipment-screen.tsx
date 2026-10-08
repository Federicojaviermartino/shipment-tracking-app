"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { opsQueries } from "@/ui/hooks/queries";
import { buttonStyles } from "@/ui/kit/button-styles";
import { EmptyState } from "@/ui/kit/empty-state";
import { useOpsSession } from "@/ui/shell/session";
import { CasePanel } from "./case-panel";
import { DeliveryBlock } from "./delivery-block";
import { DocumentsCard } from "./documents-card";
import { LAYOUT, MAIN, RAIL } from "./layout";
import { MessagesCard } from "./messages-card";
import { ReferencesCard } from "./references-card";
import { ShipmentHeader } from "./shipment-header";
import { ShipmentSkeleton } from "./shipment-skeleton";
import { type PointedEntry, ShipmentTimeline } from "./shipment-timeline";
import { entryAnchor } from "./timeline-entries";

// The rail stays beside the timeline while it scrolls, and scrolls by itself when it is taller
// than the window leaves it: the top bar and a margin above, the frame's bottom padding below,
// so that the end of the page never pushes it under the bar. Its scrollbar sits in the gutter,
// and the cards keep the right edge of the page.
const STICKY =
  "lg:sticky lg:top-[calc(var(--spacing-topbar)+1rem)] lg:-mr-3 lg:max-h-[calc(100dvh-var(--spacing-topbar)-7rem)] lg:overflow-y-auto lg:pr-3 lg:[scrollbar-width:thin]";

/** One shipment as operations work it: the open cases, the timeline, and the facts in a rail. */
export function OpsShipmentScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { estela, actor, now } = useOpsSession();
  const { data: shipment, isPending } = useQuery(opsQueries.shipment(estela, actor, id));
  const [pointed, setPointed] = useState<PointedEntry | null>(null);

  if (isPending) {
    return <ShipmentSkeleton />;
  }
  // Unknown and outside the perimeter are the same answer, here as in the gateway.
  if (!shipment) {
    return (
      <EmptyState
        title="We couldn't find that shipment."
        action={
          <Link href="/ops" className={buttonStyles()}>
            Back to shipments
          </Link>
        }
      />
    );
  }

  function viewEntry(entryId: string) {
    const anchor = entryAnchor(entryId);
    setPointed((last) => ({ anchor, visits: (last?.visits ?? 0) + 1 }));
    document.getElementById(anchor)?.scrollIntoView({ block: "center" });
  }

  return (
    <>
      <ShipmentHeader shipment={shipment} />
      <div className={LAYOUT}>
        <div className={MAIN}>
          {shipment.cases.map((caseView, index) => (
            // By position, primary first: a case that changes its type under an open draft
            // (a predicted delay that the operator then declares) keeps its panel and the drawer.
            <CasePanel
              key={index}
              shipmentId={shipment.id}
              caseView={caseView}
              now={now}
              onViewEntry={viewEntry}
            />
          ))}
          <ShipmentTimeline shipment={shipment} now={now} pointed={pointed} />
        </div>
        <aside aria-label="Shipment details" className={STICKY}>
          <div className={RAIL}>
            <DeliveryBlock dates={shipment.dates} customerSees={shipment.customerSees} />
            <DocumentsCard documents={shipment.documents} />
            <ReferencesCard references={shipment.references} />
            <MessagesCard messages={shipment.messages} />
          </div>
        </aside>
      </div>
    </>
  );
}
