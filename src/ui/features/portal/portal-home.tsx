import type { PortalHome as PortalHomeView } from "@/application/views";
import type { Instant } from "@/domain/time";
import { Card } from "@/ui/kit/card";
import { EmptyState } from "@/ui/kit/empty-state";
import { DeliveredRow } from "./delivered-row";
import { NoticeCard } from "./notice-card";
import { ShipmentGroup } from "./shipment-group";
import { ShipmentList } from "./shipment-list";

type PortalHomeProps = {
  home: PortalHomeView;
  firstName: string;
  now: Instant;
};

/** The customer's list: one computed sentence, what they were told, then their shipments. */
export function PortalHome({ home, firstName, now }: PortalHomeProps) {
  const { notices, attention, onTheWay, delivered } = home;
  const verdictLabels = new Map(
    [...attention, ...onTheWay].map((shipment) => [shipment.id, shipment.verdictLabel]),
  );

  return (
    <div className="flex flex-col gap-8 text-base">
      <header>
        <p className="text-ink-600">Hello, {firstName}.</p>
        <h1 className="mt-1 text-2xl font-semibold">{home.summary}</h1>
      </header>

      {notices.length > 0 && (
        <section aria-label="Notices" className="flex flex-col gap-4">
          {notices.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              verdictLabel={verdictLabels.get(notice.shipmentId)}
              now={now}
              preview
            />
          ))}
        </section>
      )}

      {attention.length > 0 && (
        <ShipmentGroup title="Needs your attention" count={attention.length}>
          <ShipmentList shipments={attention} now={now} />
        </ShipmentGroup>
      )}

      {/* With something to attend to, an empty second group would deny it: it is left out. */}
      {(onTheWay.length > 0 || attention.length === 0) && (
        <ShipmentGroup title="On the way" count={onTheWay.length}>
          {onTheWay.length > 0 ? (
            <ShipmentList shipments={onTheWay} now={now} />
          ) : (
            <Card>
              <EmptyState title="No shipments on the way." className="px-2 py-4" />
            </Card>
          )}
        </ShipmentGroup>
      )}

      {delivered.length > 0 && (
        <ShipmentGroup title="Delivered in the last 30 days" count={delivered.length}>
          <Card className="overflow-hidden px-0 py-0">
            <ul className="divide-y divide-line">
              {delivered.map((shipment) => (
                <DeliveredRow key={shipment.id} shipment={shipment} />
              ))}
            </ul>
          </Card>
        </ShipmentGroup>
      )}
    </div>
  );
}
