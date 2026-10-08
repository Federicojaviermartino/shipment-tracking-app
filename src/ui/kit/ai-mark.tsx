import { clsx } from "clsx";
import { type AiState, aiWords } from "./ai-words";
import { tagShape } from "./tag";

const WRITTEN: AiState = { kind: "written" };

type AiMarkProps = {
  /** What the model did. Text it wrote, by default. */
  state?: AiState;
  /** Prints `AI` alone, for a column of marks whose caption carries the words. */
  compact?: boolean;
  className?: string;
};

/**
 * Marks what a model wrote or read, and nothing else: counts, staleness and playbook steps
 * are deterministic and never carry it. Once a person has edited or confirmed the output,
 * the tag leaves the model's colour.
 */
export function AiMark({ state = WRITTEN, compact = false, className }: AiMarkProps) {
  const { tag, reviewed } = aiWords(state);

  return (
    <span
      className={clsx(
        tagShape,
        reviewed ? "bg-sunken text-ink-700" : "bg-ai-50 text-ai-700",
        className,
      )}
    >
      {compact ? "AI" : tag}
    </span>
  );
}
