"use client";

import type { OpsRow } from "@/application/views";
import type { Instant } from "@/domain/time";
import { StepAction } from "@/ui/features/message-drawer/step-action";
import { age } from "@/ui/format/when";
import { TableActionCell, TableCell } from "@/ui/kit/table";
import { TableRow } from "@/ui/kit/table-row";
import type { ThirdColumn } from "./column-heads";
import { DeliveryCell } from "./delivery-cell";
import { ReasonCell } from "./reason-cell";
import { ShipmentCell } from "./shipment-cell";
import { StatusCell } from "./status-cell";

type ShipmentRowProps = {
  row: OpsRow;
  third: ThirdColumn;
  now: Instant;
  /** An operator update brought the shipment into the list while it was open. */
  fresh: boolean;
};

/** A shipment in the table. It flashes once in place whenever an operator says something new. */
export function ShipmentRow({ row, third, now, fresh }: ShipmentRowProps) {
  const step = row.case?.nextStep;

  return (
    <TableRow flashKey={row.lastUpdate?.at} fresh={fresh}>
      <StatusCell row={row} />
      <ShipmentCell row={row} />
      {third === "reason" && row.case ? (
        <ReasonCell case={row.case} />
      ) : (
        <TableCell>
          <p className="line-clamp-1">{row.stage.label}</p>
          {row.stage.detail && (
            <p className="mt-1 line-clamp-1 text-xs text-ink-600">{row.stage.detail}</p>
          )}
        </TableCell>
      )}
      <DeliveryCell dates={row.dates} />
      {step ? (
        <TableActionCell>
          <StepAction shipmentId={row.id} step={step} size="sm" inRow />
        </TableActionCell>
      ) : (
        <TableCell />
      )}
      <TableCell className="text-right text-xs/5 whitespace-nowrap text-ink-600 tabular-nums">
        {row.lastUpdate ? age(row.lastUpdate.at, now) : "No update yet"}
      </TableCell>
    </TableRow>
  );
}
