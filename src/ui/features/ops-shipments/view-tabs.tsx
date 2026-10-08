"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { QueueView } from "@/application/estela";
import { opsQueries } from "@/ui/hooks/queries";
import { Tab, TabList, TabPanel, Tabs } from "@/ui/kit/tabs";
import { useOpsSession } from "@/ui/shell/session";

const TABS: { view: QueueView; label: string }[] = [
  { view: "attention", label: "Needs attention" },
  { view: "waiting", label: "Waiting" },
  { view: "all", label: "All" },
];

type ViewTabsProps = {
  view: QueueView;
  /** A question or a filter narrows what the active view shows. */
  narrowed: boolean;
  /** Opens a view whole: no question, no filter. */
  onSelect: (view: QueueView) => void;
  /** The list of the active view. */
  children: ReactNode;
};

/** The three views of the one table, with how many shipments each holds for this reader. */
export function ViewTabs({ view, narrowed, onSelect, children }: ViewTabsProps) {
  const { estela, actor } = useOpsSession();
  const counts = useQuery(opsQueries.overview(estela, actor)).data?.counts;

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        const next = TABS.find((tab) => tab.view === value);
        if (next) onSelect(next.view);
      }}
    >
      <TabList label="Views">
        {TABS.map((tab) => (
          <Tab
            key={tab.view}
            value={tab.view}
            count={counts?.[tab.view]}
            // The active tab is also the way back from a question or a filter to the whole view.
            onClick={() => {
              if (tab.view === view && narrowed) onSelect(tab.view);
            }}
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      {/* One panel per tab, so that each tab controls an element that exists; only the active
          one renders the list. The list brings its own tab stops: the panel is not one more. */}
      {TABS.map((tab) => (
        <TabPanel
          key={tab.view}
          value={tab.view}
          tabIndex={-1}
          className="flex-col gap-3 outline-hidden data-[state=active]:flex"
        >
          {children}
        </TabPanel>
      ))}
    </Tabs>
  );
}
