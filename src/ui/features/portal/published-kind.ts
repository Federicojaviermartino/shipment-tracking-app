import type { PublishedView } from "@/application/views";
import { assertNever } from "@/ui/kit/assert-never";
import type { ProvenanceKind } from "@/ui/kit/provenance";

export type DatedPublished = Exclude<PublishedView, { kind: "under_review" }>;

/**
 * The mark of a published date. A customer reads "Estimated" for both estimates; the mark still
 * tells the carrier's from the one a named person approved in a notice.
 */
export function publishedKind(published: DatedPublished): ProvenanceKind {
  switch (published.kind) {
    case "confirmed":
    case "planned":
      return published.kind;
    case "estimated":
      return published.by === "carrier" ? "declared" : "estimated";
    default:
      return assertNever(published);
  }
}
