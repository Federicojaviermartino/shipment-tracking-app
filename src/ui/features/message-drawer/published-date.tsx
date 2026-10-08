import type { PublishedView } from "@/application/views";
import { dayValue } from "@/ui/format/when";
import { DateStamp } from "@/ui/kit/date-stamp";
import type { ProvenanceKind } from "@/ui/kit/provenance";

type Dated = Exclude<PublishedView, { kind: "under_review" }>;

// A date a notice gave is Estela's estimate with a person's approval; the carrier's is declared.
function markOf(published: Dated): ProvenanceKind {
  if (published.kind !== "estimated") {
    return published.kind;
  }
  return published.by === "carrier" ? "declared" : "estimated";
}

/** The delivery date a customer currently reads, with the words the portal puts beside it. */
export function PublishedDate({ published }: { published: PublishedView }) {
  if (published.kind === "under_review") {
    return <span>{published.line}</span>;
  }
  return (
    // The words wrap as one piece, under the date, where the two do not fit on a line.
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <DateStamp
        kind={markOf(published)}
        audience="customer"
        {...dayValue(published.day)}
        words="none"
      />
      <span className="text-xs text-ink-600">{published.line}</span>
    </span>
  );
}
