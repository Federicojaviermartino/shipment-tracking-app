"use client";

import type { ReactNode } from "react";
import type { OpsRow } from "@/application/views";
import type { ThirdColumn } from "./column-heads";
import { PanelError } from "./panel-error";
import { ShipmentsTable } from "./shipments-table";
import { TableSkeleton } from "./table-skeleton";

type ShipmentRowsProps = {
  caption: string;
  third: ThirdColumn;
  /** `undefined` until the first answer arrives. */
  rows: OpsRow[] | undefined;
  failed: boolean;
  onRetry: () => void;
  /** What to say when there are no rows. */
  empty: ReactNode;
};

/** The rows of a list in whichever state they are: loading, failed, none or some. */
export function ShipmentRows({ caption, third, rows, failed, onRetry, empty }: ShipmentRowsProps) {
  if (rows === undefined) {
    return failed ? (
      <PanelError onRetry={onRetry}>Couldn&apos;t load the shipments.</PanelError>
    ) : (
      <TableSkeleton third={third} />
    );
  }
  if (rows.length === 0) {
    return empty;
  }
  return <ShipmentsTable caption={caption} rows={rows} third={third} />;
}
