import type { QueueView } from "@/application/estela";
import type { Health } from "@/domain/exceptions";
import type { ShipmentFilter } from "@/domain/filters";
import type { Country } from "@/domain/shipment";
import type { Stage } from "@/domain/stage";

export type FilterField = keyof ShipmentFilter;

/**
 * The state of the shipments list lives in the URL, so that every view of the demo can be linked.
 * It is in one of two modes: a question that was asked, or filters that were set by hand.
 */
export type ListState = {
  view: QueueView;
  /** What was typed in the ask bar, kept so that a reload asks again. */
  ask: string | null;
  /** The parts of the question's reading that the reader removed. Only with a question. */
  dropped: FilterField[];
  /** What a digest chip or a toast's "View" set. Empty while a question is shown. */
  filter: ShipmentFilter;
};

const VIEWS: readonly QueueView[] = ["attention", "waiting", "all"];
const COUNTRIES: readonly Country[] = ["ES", "FR", "DE", "MX"];
const HEALTHS: readonly Health[] = ["held", "delayed", "at_risk", "stale", "on_time", "delivered"];
const STAGES: readonly Stage[] = [
  "booked",
  "in_transit",
  "at_origin_port",
  "at_sea",
  "at_destination_port",
  "final_leg",
  "out_for_delivery",
  "delivered",
];
const DUES: readonly NonNullable<ShipmentFilter["due"]>[] = ["today", "this_week", "next_week"];
// Typed as a record so that a new filter field fails the build until it is listed.
const FIELD: Record<FilterField, true> = {
  destinationCountry: true,
  originSiteId: true,
  accountId: true,
  operatorId: true,
  vessel: true,
  health: true,
  stage: true,
  customsHold: true,
  due: true,
  delivered: true,
  text: true,
};
const FIELDS = Object.keys(FIELD) as FilterField[];

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function someOf<T extends string>(allowed: readonly T[], value: string | null): T[] | undefined {
  const picked = (value ?? "").split(",").flatMap((part) => oneOf(allowed, part) ?? []);
  return picked.length > 0 ? picked : undefined;
}

function readFilter(params: Pick<URLSearchParams, "get">): ShipmentFilter {
  const delivered = params.get("delivered");
  return withoutEmpty({
    destinationCountry: oneOf(COUNTRIES, params.get("dest")),
    originSiteId: params.get("site") ?? undefined,
    accountId: params.get("account") ?? undefined,
    operatorId: params.get("operator") ?? undefined,
    vessel: params.get("vessel") ?? undefined,
    health: someOf(HEALTHS, params.get("health")),
    stage: someOf(STAGES, params.get("stage")),
    customsHold: params.get("customs") === "held" ? true : undefined,
    due: oneOf(DUES, params.get("due")),
    delivered: delivered === "yes" ? true : delivered === "no" ? false : undefined,
    text: params.get("text") ?? undefined,
  });
}

export function readListState(params: Pick<URLSearchParams, "get">): ListState {
  const ask = params.get("q")?.trim() || null;
  if (ask) {
    // A question is asked of the whole portfolio, and takes the place of any filter set by hand.
    return { view: "all", ask, dropped: someOf(FIELDS, params.get("drop")) ?? [], filter: {} };
  }
  return {
    view: oneOf(VIEWS, params.get("view")) ?? "attention",
    ask: null,
    dropped: [],
    filter: readFilter(params),
  };
}

function withoutEmpty(filter: ShipmentFilter): ShipmentFilter {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined));
}

export function hasFilter(filter: ShipmentFilter): boolean {
  return Object.keys(withoutEmpty(filter)).length > 0;
}

/** A filter minus some of its fields: what is left when the reader removes a chip. */
export function withoutFields(
  filter: ShipmentFilter,
  fields: readonly FilterField[],
): ShipmentFilter {
  return Object.fromEntries(
    Object.entries(filter).filter(([field]) => !fields.some((dropped) => dropped === field)),
  );
}

/** Adds a status to the filter, or takes it out when it is already there. */
export function toggleHealth(filter: ShipmentFilter, health: Health): ShipmentFilter {
  const current = filter.health ?? [];
  const next = current.includes(health)
    ? current.filter((candidate) => candidate !== health)
    : [...current, health];
  return withoutEmpty({ ...filter, health: next.length > 0 ? next : undefined });
}

export function listHref({
  view = "attention",
  ask = null,
  dropped = [],
  filter = {},
}: Partial<ListState>) {
  const params = new URLSearchParams();
  if (view !== "attention") params.set("view", view);
  if (ask) params.set("q", ask);
  if (ask && dropped.length > 0) params.set("drop", dropped.join(","));
  if (filter.destinationCountry) params.set("dest", filter.destinationCountry);
  if (filter.originSiteId) params.set("site", filter.originSiteId);
  if (filter.accountId) params.set("account", filter.accountId);
  if (filter.operatorId) params.set("operator", filter.operatorId);
  if (filter.vessel) params.set("vessel", filter.vessel);
  if (filter.health?.length) params.set("health", filter.health.join(","));
  if (filter.stage?.length) params.set("stage", filter.stage.join(","));
  if (filter.customsHold) params.set("customs", "held");
  if (filter.due) params.set("due", filter.due);
  if (filter.delivered !== undefined) params.set("delivered", filter.delivered ? "yes" : "no");
  if (filter.text) params.set("text", filter.text);
  const query = params.toString();
  return query ? `/ops?${query}` : "/ops";
}
