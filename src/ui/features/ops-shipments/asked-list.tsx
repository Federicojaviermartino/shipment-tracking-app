"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { opsQueries } from "@/ui/hooks/queries";
import { assertNever } from "@/ui/kit/assert-never";
import { Button } from "@/ui/kit/button";
import { buttonStyles } from "@/ui/kit/button-styles";
import { InlineMessage } from "@/ui/kit/inline-message";
import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";
import { useOpsSession } from "@/ui/shell/session";
import { AnswerCard } from "./answer-card";
import { InterpretedList } from "./interpreted-list";
import { ListNotice } from "./list-notice";
import { PanelError } from "./panel-error";
import { ShipmentsTable } from "./shipments-table";
import { TableSkeleton } from "./table-skeleton";
import type { FilterField } from "./url-state";

type AskedListProps = {
  question: string;
  /** The parts of the reading the reader removed. */
  dropped: FilterField[];
  onDrop: (field: FilterField) => void;
  /** Leaves the question for the whole portfolio. */
  onClear: () => void;
};

/** What a question to the ask bar came to: a filter, an answer, or the reason there is neither. */
export function AskedList({ question, dropped, onDrop, onClear }: AskedListProps) {
  const { estela, actor } = useOpsSession();
  const asked = useQuery(opsQueries.ask(estela, actor, question));
  const showAll = <Button onClick={onClear}>Show all shipments</Button>;

  if (asked.data === undefined) {
    return asked.isError ? (
      <PanelError onRetry={() => void asked.refetch()}>Couldn&apos;t read the question.</PanelError>
    ) : (
      <>
        <SkeletonGroup label="Reading the question…">
          <div className="flex gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-7 w-44" />
          </div>
        </SkeletonGroup>
        <TableSkeleton third="now" />
      </>
    );
  }

  const result = asked.data;
  switch (result.kind) {
    case "filter":
      return (
        <InterpretedList reading={result} dropped={dropped} onDrop={onDrop} onClear={onClear} />
      );
    case "answer":
      return (
        <>
          <AnswerCard row={result.row} statusLine={result.statusLine} />
          <ShipmentsTable caption="The shipment asked about" rows={[result.row]} third="now" />
        </>
      );
    case "unsupported":
      return (
        <ListNotice
          title={result.message}
          action={
            result.shipmentId ? (
              <Link href={`/ops/shipments/${result.shipmentId}`} className={buttonStyles()}>
                Open {result.shipmentId}
              </Link>
            ) : (
              showAll
            )
          }
        />
      );
    case "not_found":
      return <ListNotice title={result.message} action={showAll} />;
    case "not_understood":
      return (
        <>
          <InlineMessage className="self-start">{result.message}</InlineMessage>
          {result.rows.length > 0 ? (
            <ShipmentsTable caption="Shipments matching the text" rows={result.rows} third="now" />
          ) : (
            <ListNotice title="No shipment matches that text." action={showAll} />
          )}
        </>
      );
    default:
      return assertNever(result);
  }
}
