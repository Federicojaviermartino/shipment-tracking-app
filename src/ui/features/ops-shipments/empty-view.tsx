"use client";

import { useQuery } from "@tanstack/react-query";
import type { QueueView } from "@/application/estela";
import { opsQueries } from "@/ui/hooks/queries";
import { assertNever } from "@/ui/kit/assert-never";
import { Button } from "@/ui/kit/button";
import { useOpsSession } from "@/ui/shell/session";
import { ListNotice } from "./list-notice";

type EmptyViewProps = {
  view: QueueView;
  onShowAll: () => void;
};

/** A view with no rows and no filter: each one says what its emptiness means. */
export function EmptyView({ view, onShowAll }: EmptyViewProps) {
  const { estela, actor } = useOpsSession();
  const counts = useQuery(opsQueries.overview(estela, actor)).data?.counts;

  switch (view) {
    case "attention":
      return (
        <ListNotice
          title="Nothing needs you right now."
          action={<Button onClick={onShowAll}>Show all shipments</Button>}
        >
          {counts &&
            (counts.onPlan === 1
              ? "1 shipment in your perimeter is moving as planned."
              : `${counts.onPlan} shipments in your perimeter are moving as planned.`)}
        </ListNotice>
      );
    case "waiting":
      return (
        <ListNotice title="Nothing is waiting on someone else.">
          A case moves here once your part is done and the next move is not yours.
        </ListNotice>
      );
    case "all":
      return <ListNotice title="There are no shipments in your perimeter." />;
    default:
      return assertNever(view);
  }
}
