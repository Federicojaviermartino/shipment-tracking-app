import type { AiReading } from "@/ui/kit/ai-words";

/**
 * What the kit's AI mark needs to know about a reading: nothing while it waits for a person,
 * and the name of whoever confirmed it afterwards.
 */
export function readingState(confirmed: boolean, reviewedBy: string | null): AiReading {
  return confirmed ? { confirmedBy: reviewedBy ?? "a reviewer" } : {};
}
