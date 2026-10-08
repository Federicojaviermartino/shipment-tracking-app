import { clsx } from "clsx";
import type { ReactNode } from "react";

/** The shape of every tag. `AiMark` takes it too, so that the two cannot drift apart. */
export const tagShape =
  "inline-flex h-4 shrink-0 items-center rounded-sm px-1 font-mono text-2xs font-medium tracking-wider whitespace-nowrap uppercase";

const TONE = {
  neutral: "bg-sunken text-ink-700",
  brand: "bg-brand-50 text-brand-700",
} as const;

type TagProps = {
  /** `brand` is for what just changed ("New"); `neutral` for everything else ("2 sources"). */
  tone?: keyof typeof TONE;
  className?: string;
  children: ReactNode;
};

/**
 * A small fact about the thing it sits next to, in a word or two. It is square on purpose:
 * only statuses are pills. It sets capitals, so it takes words only: a date goes through
 * `DateText` and a measure through `Delta`. Model output has its own tag, `AiMark`.
 */
export function Tag({ tone = "neutral", className, children }: TagProps) {
  return <span className={clsx(tagShape, TONE[tone], className)}>{children}</span>;
}
