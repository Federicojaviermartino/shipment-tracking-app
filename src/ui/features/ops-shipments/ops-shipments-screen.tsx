"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AskedList } from "./asked-list";
import { DigestBand } from "./digest-band";
import { FilteredList } from "./filtered-list";
import { hasFilter, listHref, type ListState, readListState, toggleHealth } from "./url-state";
import { ViewTabs } from "./view-tabs";

/**
 * Operations home: the queue and the portfolio in one table. Everything the reader chose (the
 * view, the question, the filters) is in the URL, and every control here only rewrites it.
 */
export function OpsShipmentsScreen() {
  const router = useRouter();
  const state = readListState(useSearchParams());
  const { view, ask, dropped, filter } = state;

  function go(next: Partial<ListState>) {
    router.push(listHref(next), { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Shipments</h1>
      <DigestBand
        selected={filter.health ?? []}
        onToggle={(health) => go({ view: "all", filter: toggleHealth(filter, health) })}
      />
      <ViewTabs
        view={view}
        narrowed={ask !== null || hasFilter(filter)}
        onSelect={(next) => go({ view: next })}
      >
        {ask === null ? (
          <FilteredList
            view={view}
            filter={filter}
            onFilterChange={(next) => go({ view, filter: next })}
            onShowAll={() => go({ view: "all" })}
          />
        ) : (
          <AskedList
            question={ask}
            dropped={dropped}
            onDrop={(field) => go({ view, ask, dropped: [...dropped, field] })}
            onClear={() => go({ view: "all" })}
          />
        )}
      </ViewTabs>
    </div>
  );
}
