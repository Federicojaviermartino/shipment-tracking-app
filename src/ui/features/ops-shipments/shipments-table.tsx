"use client";

import { useState } from "react";
import type { OpsRow } from "@/application/views";
import { Table } from "@/ui/kit/table";
import { useOpsSession } from "@/ui/shell/session";
import { ColumnHeads, type ThirdColumn } from "./column-heads";
import { ShipmentRow } from "./shipment-row";

type ShipmentsTableProps = {
  caption: string;
  rows: OpsRow[];
  third: ThirdColumn;
};

/** The one table of the screen: it serves the queue and the portfolio alike. */
export function ShipmentsTable({ caption, rows, third }: ShipmentsTableProps) {
  const { now } = useOpsSession();
  // What the table held when it was opened, and when. A shipment that an operator update brings
  // in later is marked as new; one that a changed filter brings in is not.
  const [opened] = useState(() => ({ at: now, ids: new Set(rows.map((row) => row.id)) }));

  return (
    <Table caption={caption}>
      <ColumnHeads third={third} />
      <tbody>
        {rows.map((row) => (
          <ShipmentRow
            key={row.id}
            row={row}
            third={third}
            now={now}
            fresh={!opened.ids.has(row.id) && (row.lastUpdate?.at ?? 0) > opened.at}
          />
        ))}
      </tbody>
    </Table>
  );
}
