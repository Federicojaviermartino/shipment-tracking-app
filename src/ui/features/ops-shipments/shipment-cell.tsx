import Link from "next/link";
import type { OpsRow } from "@/application/views";
import { Lane } from "@/ui/kit/lane";
import { RouteStrip } from "@/ui/kit/route-strip";
import { TableCell } from "@/ui/kit/table";
import { routeProps } from "./route-props";

/** Names the row: its reference is the link that makes the whole row open the shipment. */
export function ShipmentCell({ row }: { row: OpsRow }) {
  return (
    <TableCell as="th">
      {/* Clamped rather than truncated: text that may wrap cannot widen the column. */}
      <p className="line-clamp-1 break-all">
        <Link href={`/ops/shipments/${row.id}`} className="link-stretched font-mono font-medium">
          {row.id}
        </Link>
        <span className="text-ink-600">
          {" "}
          · Order {row.orderRef} · {row.account.name}
        </span>
      </p>
      <div className="mt-1 flex items-center gap-3">
        <RouteStrip variant="mini" {...routeProps(row)} />
        <Lane
          from={row.origin.place.name}
          to={`${row.destination.place.name}, ${row.destination.place.country}`}
          className="line-clamp-1 text-xs break-all text-ink-600"
        />
      </div>
    </TableCell>
  );
}
