"use client";

import type { AskResult } from "@/application/views";
import { Button } from "@/ui/kit/button";
import { useOpsSession } from "@/ui/shell/session";
import { FilterChips } from "./filter-chips";
import { ListNotice } from "./list-notice";
import { ShipmentRows } from "./shipment-rows";
import { type FilterField, withoutFields } from "./url-state";
import { useShipmentRows } from "./use-shipment-rows";

type InterpretedListProps = {
  /** How the question was read. */
  reading: Extract<AskResult, { kind: "filter" }>;
  /** The parts of that reading the reader removed. */
  dropped: FilterField[];
  onDrop: (field: FilterField) => void;
  onClear: () => void;
};

/**
 * A question read as a filter. A model only ever proposes the filter: the rows are whatever the
 * portfolio answers to it, and the reader can take any part of the reading back.
 */
export function InterpretedList({ reading, dropped, onDrop, onClear }: InterpretedListProps) {
  const { estela, actor } = useOpsSession();
  const filter = withoutFields(reading.filter, dropped);
  const chips = estela.ops.describeFilter(actor, filter);
  const shipments = useShipmentRows("all", filter);

  return (
    <>
      <FilterChips
        by="ai"
        chips={chips}
        notUsed={reading.notUsed}
        // Without its last chip the reading says nothing: the question goes with it.
        onRemove={(field) => (chips.length > 1 ? onDrop(field) : onClear())}
      />
      <ShipmentRows
        caption="Shipments matching the question"
        third="now"
        rows={shipments.data}
        failed={shipments.isError}
        onRetry={() => void shipments.refetch()}
        empty={
          <ListNotice
            title="No shipments match these filters."
            action={<Button onClick={onClear}>Clear filters</Button>}
          />
        }
      />
    </>
  );
}
