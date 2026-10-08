"use client";

import type { ReactNode } from "react";
import type { EvidenceView } from "@/application/views";
import type { Instant } from "@/domain/time";
import { age } from "@/ui/format/when";
import { AiMark } from "@/ui/kit/ai-mark";
import { type AiState, aiWords } from "@/ui/kit/ai-words";
import { assertNever } from "@/ui/kit/assert-never";
import { Button } from "@/ui/kit/button";
import { provenanceWords } from "@/ui/kit/provenance";
import { ProvenanceMark } from "@/ui/kit/provenance-mark";
import { readingState } from "./reading-state";

type Grammar = { mark: ReactNode; words: string };

// One mark for each kind of evidence. A rule has none: nobody asserted it.
function grammarOf(line: EvidenceView, reviewedBy: string | null): Grammar {
  switch (line.provenance) {
    case "confirmed":
    case "declared":
    case "estimated":
      return {
        mark: <ProvenanceMark kind={line.provenance} words="none" />,
        words: provenanceWords(line.provenance, "ops").label,
      };
    case "ai_reading": {
      const state: AiState = { kind: "reading", ...readingState(line.confirmed, reviewedBy) };
      return { mark: <AiMark state={state} compact />, words: aiWords(state).tag };
    }
    case "rule":
      return { mark: null, words: "Rule" };
    default:
      return assertNever(line.provenance);
  }
}

type EvidenceListProps = {
  evidence: readonly EvidenceView[];
  /** Who confirmed the reading of the case, when somebody has. */
  reviewedBy: string | null;
  now: Instant;
  onViewEntry: (entryId: string) => void;
};

/** "Why it is here": each line with where it comes from, and a way to its timeline entry. */
export function EvidenceList({ evidence, reviewedBy, now, onViewEntry }: EvidenceListProps) {
  return (
    <ul className="mt-2 grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2 gap-y-2">
      {evidence.map((line) => {
        const { mark, words } = grammarOf(line, reviewedBy);
        const { entryId } = line;
        return (
          <li key={line.text} className="col-span-3 grid grid-cols-subgrid items-start">
            <span className="flex h-5 items-center">{mark}</span>
            <div>
              <p>{line.text}</p>
              <p className="text-xs text-ink-600">
                {[words, line.source, line.receivedAt !== null && age(line.receivedAt, now)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {entryId !== null && (
              // A 28px target on a 20px line: the negative margin keeps the rows tight.
              <Button
                variant="link"
                size="sm"
                className="-my-1"
                onClick={() => onViewEntry(entryId)}
              >
                View in timeline
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
