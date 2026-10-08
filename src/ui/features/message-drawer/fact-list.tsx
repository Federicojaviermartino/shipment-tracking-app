import type { FactLine } from "@/application/views";
import { AiMark } from "@/ui/kit/ai-mark";
import { assertNever } from "@/ui/kit/assert-never";
import { ProvenanceMark } from "@/ui/kit/provenance-mark";

// A fact that is not a date and that nobody had to read from free text has no mark.
function FactMark({ provenance }: Pick<FactLine, "provenance">) {
  switch (provenance) {
    case "confirmed":
    case "declared":
    case "estimated":
    case "planned":
    case "committed":
      return <ProvenanceMark kind={provenance} />;
    case "ai_reading":
      return <AiMark state={{ kind: "reading" }} compact />;
    case "record":
      return null;
    default:
      return assertNever(provenance);
  }
}

type FactListProps = {
  facts: readonly FactLine[];
};

/** Lines of the fact sheet a draft was written from: read-only, each with its provenance. */
export function FactList({ facts }: FactListProps) {
  return (
    <ul className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
      {facts.map((fact) => (
        <li
          key={fact.id}
          className="col-span-2 grid grid-cols-subgrid border-t border-line py-2 first:border-t-0"
        >
          <span className="flex h-4 items-center">
            <FactMark provenance={fact.provenance} />
          </span>
          <div>
            <p className="text-xs text-ink-600">
              {fact.label}
              {fact.source && ` · ${fact.source}`}
            </p>
            <p>{fact.value}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
