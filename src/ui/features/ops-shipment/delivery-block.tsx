import { useId } from "react";
import type { CustomerSeesView, DatesView } from "@/application/views";
import { PublishedDate } from "@/ui/features/message-drawer/published-date";
import { VerdictPill } from "@/ui/features/message-drawer/verdict-pill";
import { dateValue, dayValue, lateBy } from "@/ui/format/when";
import { Card } from "@/ui/kit/card";
import { DateStamp } from "@/ui/kit/date-stamp";
import { Delta } from "@/ui/kit/delta";
import { DATE_NOTE, DATE_ROW, DateLabel } from "./date-row";
import { EstelaEstimateRow } from "./estela-estimate-row";
import { OperatorEstimateRow } from "./operator-estimate-row";

type DeliveryBlockProps = {
  dates: DatesView;
  customerSees: CustomerSeesView;
};

/**
 * The door date, three times over: what was promised, what the operator says and what Estela
 * says, each with its mark. Under the line, what the customer is being told right now.
 */
export function DeliveryBlock({ dates, customerSees }: DeliveryBlockProps) {
  const titleId = useId();
  const { delivered, estela } = dates;
  const deliveredDelta = delivered && dates.best ? lateBy(dates.best.lateBy) : null;

  return (
    <Card as="section" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-lg font-semibold">
        Delivery
      </h2>
      <dl className="mt-3">
        <div className={DATE_ROW}>
          <DateLabel kind="committed">Committed</DateLabel>
          <dd>
            <DateStamp kind="committed" {...dayValue(dates.committed)} mark={false} words="none" />
          </dd>
        </div>
        {delivered ? (
          <div className={DATE_ROW}>
            <DateLabel kind="confirmed">Delivered</DateLabel>
            <dd className="flex items-center gap-3">
              {deliveredDelta && <Delta>{deliveredDelta}</Delta>}
              <DateStamp
                kind="confirmed"
                {...dateValue(delivered.when)}
                mark={false}
                words="none"
              />
            </dd>
            <dd className={DATE_NOTE}>Confirmed by {delivered.by}</dd>
          </div>
        ) : (
          <OperatorEstimateRow dates={dates} />
        )}
        {estela && <EstelaEstimateRow estela={estela} />}
      </dl>
      <div className="mt-1 border-t border-line pt-3">
        <h3 className="text-label">Customer currently sees</h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <VerdictPill sees={customerSees} />
          <PublishedDate published={customerSees.published} />
        </p>
      </div>
    </Card>
  );
}
