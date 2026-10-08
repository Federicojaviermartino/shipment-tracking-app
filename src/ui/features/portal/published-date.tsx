import type { PublishedView } from "@/application/views";
import { dateValue } from "@/ui/format/when";
import { DateStamp } from "@/ui/kit/date-stamp";
import { publishedKind } from "./published-kind";

/**
 * The delivery date of a list entry with its provenance word. A date under review prints its
 * sentence and no date: the previous one is no longer a promise.
 */
export function PublishedDate({ published }: { published: PublishedView }) {
  if (published.kind === "under_review") {
    return <span className="text-sm text-ink-600">{published.line}</span>;
  }
  return (
    <DateStamp
      kind={publishedKind(published)}
      audience="customer"
      size="base"
      words="label"
      {...dateValue(published.when)}
    />
  );
}
