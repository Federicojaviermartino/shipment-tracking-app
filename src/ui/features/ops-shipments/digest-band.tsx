"use client";

import { useQuery } from "@tanstack/react-query";
import type { OpsOverview } from "@/application/views";
import type { ExceptionHealth, Health } from "@/domain/exceptions";
import { HEALTH_LABEL } from "@/domain/labels";
import { opsQueries } from "@/ui/hooks/queries";
import { Card } from "@/ui/kit/card";
import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";
import { StatusPill } from "@/ui/kit/status-pill";
import { useOpsSession } from "@/ui/shell/session";
import { DigestHighlight } from "./digest-highlight";
import { PanelError } from "./panel-error";

const CHIPS: { health: ExceptionHealth; count: keyof OpsOverview["counts"] }[] = [
  { health: "delayed", count: "delayed" },
  { health: "held", count: "held" },
  { health: "at_risk", count: "atRisk" },
  { health: "stale", count: "stale" },
];

type DigestBandProps = {
  /** The statuses the list is filtered by. */
  selected: readonly Health[];
  onToggle: (health: Health) => void;
};

/**
 * The briefing: what needs the reader, counted. The counts are computed, so they are status
 * chips and plain text; only the sentence under them was written by a model.
 */
export function DigestBand({ selected, onToggle }: DigestBandProps) {
  const { estela, actor } = useOpsSession();
  const overview = useQuery(opsQueries.overview(estela, actor));

  if (overview.data === undefined) {
    return (
      <Card as="section" aria-label="Briefing">
        {overview.isError ? (
          <PanelError onRetry={() => void overview.refetch()}>
            Couldn&apos;t load the briefing.
          </PanelError>
        ) : (
          <SkeletonGroup label="Loading the briefing…">
            <div className="flex items-center gap-2">
              <Skeleton pill className="h-6 w-24" />
              <Skeleton pill className="h-6 w-20" />
              <Skeleton pill className="h-6 w-24" />
              <Skeleton className="ml-2 h-4 w-96" />
            </div>
          </SkeletonGroup>
        )}
      </Card>
    );
  }

  const { counts, line } = overview.data;
  // A status nobody has is not offered, unless it is the filter in force and has to be undone.
  const chips = CHIPS.filter(({ health, count }) => counts[count] > 0 || selected.includes(health));

  return (
    <Card as="section" aria-label="Briefing" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {chips.length > 0 && (
          <div role="group" aria-label="Filter by status" className="flex gap-2">
            {chips.map(({ health, count }) => (
              <StatusPill
                key={health}
                status={health}
                size="md"
                pressed={selected.includes(health)}
                onPressedChange={() => onToggle(health)}
              >
                {counts[count]} {HEALTH_LABEL[health]}
              </StatusPill>
            ))}
          </div>
        )}
        <p className="text-sm text-ink-600">{line}</p>
      </div>
      <DigestHighlight />
    </Card>
  );
}
