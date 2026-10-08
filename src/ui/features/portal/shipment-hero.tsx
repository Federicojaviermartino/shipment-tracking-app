import type { PortalShipmentView } from "@/application/views";
import type { Instant } from "@/domain/time";
import { dateValue, dayValue } from "@/ui/format/when";
import { Card } from "@/ui/kit/card";
import { DateStamp } from "@/ui/kit/date-stamp";
import { StatusGlyph } from "@/ui/kit/status-glyph";
import { LastUpdate } from "./last-update";
import { publishedKind } from "./published-kind";
import { VERDICT_STATUS } from "./verdict-status";

// The head is one grid: the glyphs in a 20px column, and the verdict, the date and its words on
// a single text edge beside it. A stacked hero date has the same column and gap, so it spans both.
const HEAD = "mt-2 grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2";

type ShipmentHeroProps = {
  shipment: PortalShipmentView;
  now: Instant;
};

/**
 * The answer a customer came for, readable in three seconds: the verdict and the delivery date
 * with who stands behind it. A date under review prints its sentence and no date at all.
 */
export function ShipmentHero({ shipment, now }: ShipmentHeroProps) {
  const { published, difference } = shipment;
  const committed = dayValue(shipment.committed);

  return (
    <Card as="section" density="customer" aria-label="Delivery" className="text-base max-sm:p-4">
      <h1 className="text-sm text-ink-600">
        Order {shipment.orderRef} · {shipment.cargo}
      </h1>
      <div className={HEAD}>
        <StatusGlyph status={VERDICT_STATUS[shipment.verdict]} size={20} />
        <p className="text-2xl font-semibold">{shipment.verdictLabel}</p>
        {published.kind === "under_review" ? (
          <p className="col-start-2 mt-1 text-2xl font-semibold">{published.line}</p>
        ) : (
          <>
            <DateStamp
              kind={publishedKind(published)}
              audience="customer"
              size="hero"
              layout="stacked"
              words="none"
              {...dateValue(published.when)}
              className="col-span-2 mt-1"
            />
            <p className="col-start-2 text-ink-700">{published.line}</p>
          </>
        )}
      </div>
      {/* The difference arrives as a clause: the capital is typography, not wording. */}
      <p className="mt-3 text-ink-700 first-letter:uppercase">
        {difference ? (
          <>
            {difference} (
            <DateStamp
              kind="committed"
              audience="customer"
              size="base"
              mark={false}
              words="hidden"
              {...committed}
            />
            )
          </>
        ) : (
          <>
            Committed date:{" "}
            <DateStamp
              kind="committed"
              audience="customer"
              size="base"
              mark={false}
              words="none"
              {...committed}
            />
          </>
        )}
      </p>
      {shipment.reason && <p className="mt-1 text-ink-700">{shipment.reason}</p>}
      <LastUpdate at={shipment.lastUpdateAt} now={now} className="mt-3 text-sm text-ink-600" />
    </Card>
  );
}
