import type { CaseView } from "@/application/views";
import { AiMark } from "@/ui/kit/ai-mark";
import { assertNever } from "@/ui/kit/assert-never";
import { ProvenanceMark } from "@/ui/kit/provenance-mark";

/**
 * The mark of the evidence a case rests on, for the column in front of its reason. A rule has
 * none: nobody asserted it.
 */
export function EvidenceMark({ case: open }: { case: CaseView }) {
  const evidence = open.evidence[0];
  if (!evidence) return null;

  switch (evidence.provenance) {
    case "confirmed":
    case "declared":
    case "estimated":
      return <ProvenanceMark kind={evidence.provenance} />;
    case "ai_reading":
      return (
        <AiMark
          compact
          state={{
            kind: "reading",
            // The compact mark prints no name: any reviewer, even an unnamed one, turns it ink.
            confirmedBy: evidence.confirmed ? (open.reading?.reviewedBy ?? "") : undefined,
          }}
        />
      );
    case "rule":
      return null;
    default:
      return assertNever(evidence.provenance);
  }
}
