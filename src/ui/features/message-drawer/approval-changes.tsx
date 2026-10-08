import { ArrowRight } from "lucide-react";
import { useId } from "react";
import type { Draft } from "@/application/views";
import { PublishedDate } from "./published-date";
import { VerdictPill } from "./verdict-pill";

// As tall as a line of text, so that it stays on the first line of a value that wraps.
function Becomes() {
  return (
    <span className="flex h-5 shrink-0 items-center">
      <ArrowRight aria-hidden="true" className="size-3.5 text-ink-500" />
      <span className="sr-only">becomes</span>
    </span>
  );
}

type ApprovalChangesProps = {
  changes: NonNullable<Draft["changes"]>;
};

/**
 * What the customer sees now and what they will see once the notice is approved. Both sides
 * come from the record, never from the wording of the message.
 */
export function ApprovalChanges({ changes }: ApprovalChangesProps) {
  const titleId = useId();
  const { from, to } = changes;
  const sameVerdict = from.verdict === to.verdict && from.verdictLabel === to.verdictLabel;

  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="text-label">
        What approving changes for the customer
      </h3>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <dt className="text-xs/5 text-ink-600">Verdict</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <VerdictPill sees={from} />
          {sameVerdict ? (
            <span className="text-xs text-ink-600">stays as it is</span>
          ) : (
            <>
              <Becomes />
              <VerdictPill sees={to} />
            </>
          )}
        </dd>
        <dt className="text-xs/5 text-ink-600">Date</dt>
        <dd className="flex flex-wrap items-center gap-x-2">
          <PublishedDate published={from.published} />
          {/* The arrow wraps with what it leads to. */}
          <span className="flex items-start gap-2">
            <Becomes />
            <PublishedDate published={to.published} />
          </span>
        </dd>
      </dl>
    </section>
  );
}
