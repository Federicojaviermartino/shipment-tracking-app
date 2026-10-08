import { resolveDue, type ShipmentFilter } from "@/domain/filters";
import { HEALTH_LABEL, STAGE_LABEL } from "@/domain/labels";
import type { Country } from "@/domain/shipment";
import { formatDay, type Instant } from "@/domain/time";
import { shortAccountName } from "../directory";
import type { InterpreterContext } from "../ports/query-interpreter";
import type { FilterChip } from "../views";

export const COUNTRY_NAME: Record<Country, string> = {
  ES: "Spain",
  FR: "France",
  DE: "Germany",
  MX: "Mexico",
};

const DUE_WORDS: Record<NonNullable<ShipmentFilter["due"]>, string> = {
  today: "today",
  this_week: "this week",
  next_week: "next week",
};

function either(labels: string[]): string {
  return labels.join(" or ");
}

/** "5–11 Oct", or "28 Sep – 4 Oct" across a month end. Weekdays are left out: a week is a range. */
function range(from: string, to: string): string {
  const [, fromDay = "", fromMonth = ""] = formatDay(from).split(" ");
  const [, toDay = "", toMonth = ""] = formatDay(to).split(" ");
  if (from === to) return `${fromDay} ${fromMonth}`;
  return fromMonth === toMonth
    ? `${fromDay}–${toDay} ${toMonth}`
    : `${fromDay} ${fromMonth} – ${toDay} ${toMonth}`;
}

/**
 * A filter as removable chips, one per constraint, with its values resolved: what was applied is
 * always on screen. Names come from the vocabulary of the asker's perimeter; an id outside it is
 * shown as the id, so a chip can never reveal a name the asker may not see.
 */
export function describeFilter(
  filter: ShipmentFilter,
  vocabulary: Omit<InterpreterContext, "now">,
  now: Instant,
): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (field: keyof ShipmentFilter, label: string) => chips.push({ field, label });

  if (filter.destinationCountry !== undefined) {
    add("destinationCountry", `Destination: ${COUNTRY_NAME[filter.destinationCountry]}`);
  }
  if (filter.originSiteId !== undefined) {
    const site = vocabulary.sites.find((candidate) => candidate.id === filter.originSiteId);
    add("originSiteId", `Origin: ${site?.name ?? filter.originSiteId}`);
  }
  if (filter.accountId !== undefined) {
    const account = vocabulary.accounts.find((candidate) => candidate.id === filter.accountId);
    add("accountId", `Account: ${account ? shortAccountName(account.name) : filter.accountId}`);
  }
  if (filter.operatorId !== undefined) {
    const operator = vocabulary.operators.find((candidate) => candidate.id === filter.operatorId);
    add("operatorId", `Operator: ${operator?.name ?? filter.operatorId}`);
  }
  if (filter.vessel !== undefined) add("vessel", `Vessel: ${filter.vessel}`);
  if (filter.health !== undefined) {
    add("health", `Health: ${either(filter.health.map((health) => HEALTH_LABEL[health]))}`);
  }
  if (filter.stage !== undefined) {
    add("stage", `Stage: ${either(filter.stage.map((stage) => STAGE_LABEL[stage].ops))}`);
  }
  if (filter.customsHold) add("customsHold", "Customs hold");
  if (filter.due !== undefined) {
    const { from, to } = resolveDue(filter.due, now);
    add("due", `Due: ${DUE_WORDS[filter.due]}, ${range(from, to)}`);
  }
  if (filter.delivered !== undefined) {
    add("delivered", filter.delivered ? "Delivered" : "Not delivered");
  }
  if (filter.text !== undefined) add("text", `Text: "${filter.text}"`);
  return chips;
}
