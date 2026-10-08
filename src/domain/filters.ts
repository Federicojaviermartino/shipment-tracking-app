import type { Health } from "./exceptions";
import {
  operatorsOf,
  type AccountId,
  type Country,
  type OperatorId,
  type Shipment,
  type SiteId,
} from "./shipment";
import type { Stage } from "./stage";
import { addDays, localDate, weekOf, type Instant, type LocalDate, type Zone } from "./time";

/**
 * The one structure behind the manual filters, the chips, the URL and natural-language search:
 * a model can only ever produce a filter, never a result.
 */
export type ShipmentFilter = {
  destinationCountry?: Country;
  originSiteId?: SiteId;
  accountId?: AccountId;
  operatorId?: OperatorId;
  vessel?: string;
  health?: Health[];
  stage?: Stage[];
  customsHold?: true;
  /** On the committed date. A week runs Monday to Sunday and is resolved from `now`. */
  due?: "today" | "this_week" | "next_week";
  delivered?: boolean;
  /** Plain reference or keyword match: every word must appear somewhere. */
  text?: string;
};

export type FilterableRow = {
  shipment: Shipment;
  stage: Stage;
  health: Health;
  customsHold: boolean;
};

/** "Today" and "this week" are the desk's: the manufacturer works on Madrid time. */
export const DESK_ZONE: Zone = "Europe/Madrid";

export function resolveDue(
  due: NonNullable<ShipmentFilter["due"]>,
  now: Instant,
  zone: Zone = DESK_ZONE,
): { from: LocalDate; to: LocalDate } {
  const today = localDate(now, zone);
  if (due === "today") return { from: today, to: today };
  return weekOf(due === "this_week" ? today : addDays(today, 7));
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function searchableText(shipment: Shipment): string {
  return fold(
    [
      shipment.id,
      shipment.orderRef,
      shipment.consignee.name,
      shipment.consignee.place.name,
      shipment.cargo.description,
      shipment.cargo.container?.number ?? "",
      shipment.voyage ? `${shipment.voyage.vessel} ${shipment.voyage.voyage}` : "",
      ...shipment.refs.map((ref) => ref.value),
    ].join(" "),
  );
}

function matches(row: FilterableRow, filter: ShipmentFilter, now: Instant): boolean {
  const { shipment } = row;
  if (
    filter.destinationCountry !== undefined &&
    shipment.consignee.place.country !== filter.destinationCountry
  ) {
    return false;
  }
  if (filter.originSiteId !== undefined && shipment.originSiteId !== filter.originSiteId) {
    return false;
  }
  if (filter.accountId !== undefined && shipment.accountId !== filter.accountId) return false;
  if (filter.operatorId !== undefined && !operatorsOf(shipment).includes(filter.operatorId)) {
    return false;
  }
  if (
    filter.vessel !== undefined &&
    fold(shipment.voyage?.vessel ?? "") !== fold(filter.vessel).trim()
  ) {
    return false;
  }
  if (filter.health !== undefined && !filter.health.includes(row.health)) return false;
  if (filter.stage !== undefined && !filter.stage.includes(row.stage)) return false;
  if (filter.customsHold && !row.customsHold) return false;
  if (filter.due !== undefined) {
    const { from, to } = resolveDue(filter.due, now);
    if (shipment.committedDate < from || shipment.committedDate > to) return false;
  }
  if (filter.delivered !== undefined && (row.stage === "delivered") !== filter.delivered) {
    return false;
  }
  if (filter.text !== undefined) {
    const haystack = searchableText(shipment);
    const words = fold(filter.text).split(/\s+/).filter(Boolean);
    if (!words.every((word) => haystack.includes(word))) return false;
  }
  return true;
}

/** Deterministic and pure: the same rows, filter and instant always give the same result. */
export function applyFilter<Row extends FilterableRow>(
  rows: readonly Row[],
  filter: ShipmentFilter,
  now: Instant,
): Row[] {
  return rows.filter((row) => matches(row, filter, now));
}
