"use client";

import { X } from "lucide-react";
import type { FilterChip } from "@/application/views";
import { AiMark } from "@/ui/kit/ai-mark";
import type { FilterField } from "./url-state";

const LABEL = { ai: "Read by AI as:", reader: "Filtered by:" } as const;

type FilterChipsProps = {
  /** Who set the filter: a model that read a question, or the reader by hand. */
  by: keyof typeof LABEL;
  chips: FilterChip[];
  /** The words of the question that no filter stands for. */
  notUsed?: string[];
  onRemove: (field: FilterField) => void;
};

/**
 * The filter behind the rows, one chip per constraint with its resolved value. Only a filter
 * that a model read from a question carries the AI mark; the chips are plain either way, because
 * removing one is the reader's decision.
 */
export function FilterChips({ by, chips, notUsed = [], onRemove }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {by === "ai" && <AiMark />}
      <span className="text-ink-600">{LABEL[by]}</span>
      <ul aria-label="Filters" className="flex flex-wrap gap-2">
        {chips.map(({ field, label }) => (
          <li key={field}>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onRemove(field)}
              className="group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong bg-surface pr-1.5 pl-2.5 font-medium transition-colors hover:bg-sunken active:bg-line"
            >
              {label}
              <X
                aria-hidden="true"
                className="size-3.5 text-ink-500 transition-colors group-hover:text-ink-900"
              />
            </button>
          </li>
        ))}
      </ul>
      {notUsed.length > 0 && (
        <span className="ml-1 text-ink-600">Not used: {notUsed.join(", ")}</span>
      )}
    </div>
  );
}
