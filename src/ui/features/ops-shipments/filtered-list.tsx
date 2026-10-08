"use client";

import type { QueueView } from "@/application/estela";
import type { ShipmentFilter } from "@/domain/filters";
import { Button } from "@/ui/kit/button";
import { useOpsSession } from "@/ui/shell/session";
import { EmptyView } from "./empty-view";
import { FilterChips } from "./filter-chips";
import { ListNotice } from "./list-notice";
import { ShipmentRows } from "./shipment-rows";
import { hasFilter, withoutFields } from "./url-state";
import { useShipmentRows } from "./use-shipment-rows";

const CAPTION: Record<QueueView, string> = {
  attention: "Shipments that need attention",
  waiting: "Shipments waiting on someone else",
  all: "All shipments",
};

type FilteredListProps = {
  view: QueueView;
  /** Filters set by hand; empty for the plain view. */
  filter: ShipmentFilter;
  onFilterChange: (filter: ShipmentFilter) => void;
  onShowAll: () => void;
};

/** A view of the queue or the portfolio, narrowed by the filters the reader set, if any. */
export function FilteredList({ view, filter, onFilterChange, onShowAll }: FilteredListProps) {
  const { estela, actor } = useOpsSession();
  const shipments = useShipmentRows(view, filter);
  const filtered = hasFilter(filter);

  return (
    <>
      {filtered && (
        <FilterChips
          by="reader"
          chips={estela.ops.describeFilter(actor, filter)}
          onRemove={(field) => onFilterChange(withoutFields(filter, [field]))}
        />
      )}
      <ShipmentRows
        caption={filtered ? `${CAPTION[view]}, filtered` : CAPTION[view]}
        third={view === "all" ? "now" : "reason"}
        rows={shipments.data}
        failed={shipments.isError}
        onRetry={() => void shipments.refetch()}
        empty={
          filtered ? (
            <ListNotice
              title="No shipments match these filters."
              action={<Button onClick={() => onFilterChange({})}>Clear filters</Button>}
            />
          ) : (
            <EmptyView view={view} onShowAll={onShowAll} />
          )
        }
      />
    </>
  );
}
