import type { CustomerSeesView } from "@/application/views";
import type { StatusKind } from "@/ui/kit/status-glyph";
import { StatusPill } from "@/ui/kit/status-pill";

// "In progress" makes no claim about the date, so it has no status colour either.
const VERDICT_STATUS: Record<CustomerSeesView["verdict"], StatusKind> = {
  delivered: "delivered",
  on_hold: "held",
  delayed: "delayed",
  on_time: "on_time",
  in_progress: "neutral",
};

type VerdictPillProps = {
  sees: Pick<CustomerSeesView, "verdict" | "verdictLabel">;
};

/** The verdict a customer reads on the portal, in the portal's own words. */
export function VerdictPill({ sees }: VerdictPillProps) {
  return <StatusPill status={VERDICT_STATUS[sees.verdict]}>{sees.verdictLabel}</StatusPill>;
}
