import { clsx } from "clsx";
import type { ReactNode } from "react";
import { AiMark } from "./ai-mark";
import { type AiState, aiWords } from "./ai-words";
import { Stroke } from "./stroke";

const WRITTEN: AiState = { kind: "written" };

type AiBlockProps = {
  /** What the model did, and whether a person has reviewed it. Text it wrote, by default. */
  state?: AiState;
  /** How the text was produced: "Written by AI from the 2 nearest deadlines". */
  footer?: ReactNode;
  /** `prose` is the reading size of generated sentences; `compact` sits inside dense panels. */
  density?: "prose" | "compact";
  className?: string;
  children: ReactNode;
};

/**
 * The container of anything a model wrote or read: its tag, the text and a footer, behind a
 * dotted left rule. Human review changes the mark: the rule turns solid ink.
 */
export function AiBlock({
  state = WRITTEN,
  footer,
  density = "prose",
  className,
  children,
}: AiBlockProps) {
  const { reviewed } = aiWords(state);

  return (
    <div className={clsx("relative pl-4", className)}>
      <Stroke
        kind={reviewed ? "confirmed" : "estimated"}
        orientation="vertical"
        className="absolute inset-y-0 left-0"
      />
      <div className="flex min-h-5 items-center">
        <AiMark state={state} />
      </div>
      <div className={clsx("mt-1", density === "prose" ? "text-base" : "text-sm")}>{children}</div>
      {footer && <p className="mt-2 text-xs text-ink-600">{footer}</p>}
    </div>
  );
}
