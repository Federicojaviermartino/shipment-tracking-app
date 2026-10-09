import type { DigestCase, DigestFacts, DigestWriter } from "@/application/ports/digest-writer";
import { list } from "@/application/text/format";
import { assertNever } from "@/domain/assert-never";
import { DOCUMENT_LABEL } from "@/domain/labels";
import { addDays, formatDay, localDate, localTime, type Instant, type Zone } from "@/domain/time";

/** "tonight's 20:00", "tomorrow's 12:00", "the Fri 9 Oct 12:00": a deadline as a desk says it. */
function when(at: Instant, now: Instant, zone: Zone): string {
  const day = localDate(at, zone);
  const today = localDate(now, zone);
  const time = localTime(at, zone);
  if (day === today) return `${time >= "18:00" ? "tonight's" : "today's"} ${time}`;
  if (day === addDays(today, 1)) return `tomorrow's ${time}`;
  return `the ${formatDay(day)} ${time}`;
}

function clause(item: DigestCase, now: Instant): string {
  const { deadline } = item;
  const moment = when(deadline.at, now, deadline.zone);
  switch (deadline.kind) {
    case "next_departure": {
      const place = deadline.milestone ? ` from ${deadline.milestone.place}` : "";
      const departure =
        deadline.milestone?.code === "HUB_OUT"
          ? "linehaul"
          : deadline.milestone?.code === "OUT_FOR_DELIVERY"
            ? "delivery round"
            : "departure";
      return `${item.shipmentId} can still make ${moment} ${departure}${place}`;
    }
    case "export_cutoff": {
      const documents = list(item.documents.map((type) => DOCUMENT_LABEL[type].toLowerCase()));
      const need = documents ? `needs its ${documents}` : "needs its export clearance";
      const miss = item.vessel ? ` or it misses ${item.vessel}` : "";
      return `${item.shipmentId} ${need} before ${moment} export cut-off${miss}`;
    }
    case "free_time_end":
      return `${item.shipmentId} has to leave the terminal before free time ends on ${formatDay(localDate(deadline.at, deadline.zone))}`;
    default:
      return assertNever(deadline.kind);
  }
}

function highlight(facts: DigestFacts): string | null {
  const nearest = [...facts.cases].sort((a, b) => a.deadline.at - b.deadline.at);
  if (nearest.length === 0) return null;
  const clauses = nearest.map((item) => clause(item, facts.now));
  return `Where acting today changes the outcome: ${clauses.join(", and ")}.`;
}

/**
 * Stands in for a language model that writes the one generated sentence of the briefing. Every
 * word comes from the facts it is handed: which cases, which deadline, what is missing.
 */
export const templateDigestWriter: DigestWriter = {
  highlight: (facts) => Promise.resolve(highlight(facts)),
};
