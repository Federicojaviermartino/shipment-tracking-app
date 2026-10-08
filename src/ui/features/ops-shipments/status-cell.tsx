import type { OpsRow } from "@/application/views";
import { StatusPill } from "@/ui/kit/status-pill";
import { TableCell } from "@/ui/kit/table";

/** The status of a shipment and, when its case has one, the clock it is ranked by. */
export function StatusCell({ row }: { row: OpsRow }) {
  const unconfirmed = row.case?.needsConfirmation === true;
  const clock = row.case?.clock;

  return (
    <TableCell>
      <StatusPill
        status={row.health}
        unconfirmed={unconfirmed}
        qualifier={unconfirmed ? "unconfirmed" : undefined}
      >
        {row.healthLabel}
      </StatusPill>
      {clock && <p className="mt-1 text-xs font-medium">{clock.label}</p>}
    </TableCell>
  );
}
