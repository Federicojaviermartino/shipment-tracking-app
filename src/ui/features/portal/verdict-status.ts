import type { Verdict } from "@/domain/customer-view";
import type { StatusKind } from "@/ui/kit/status-glyph";

/** The glyph and colour of a verdict. "In progress" is neutral: it makes no claim about the date. */
export const VERDICT_STATUS: Record<Verdict, StatusKind> = {
  delivered: "delivered",
  on_hold: "held",
  delayed: "delayed",
  on_time: "on_time",
  in_progress: "neutral",
};
