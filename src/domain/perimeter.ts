import type { AccountId, Shipment, SiteId, UserId } from "./shipment";

export type InternalRole = "logistics" | "customer_support";

export type InternalActor = {
  kind: "internal";
  userId: UserId;
  name: string;
  title: string;
  role: InternalRole;
  siteIds: SiteId[] | "all";
  accountIds: AccountId[] | "all";
};

export type ExternalActor = {
  kind: "external";
  userId: UserId;
  name: string;
  title: string;
  accountId: AccountId;
};

export type Actor = InternalActor | ExternalActor;

/**
 * The perimeter: an internal actor sees a shipment when both its site and its account are theirs;
 * an external actor sees the shipments of their own account. A subsidiary is an account like any
 * other. Callers must treat "out of perimeter" exactly like "does not exist".
 */
export function inScope(
  actor: Actor,
  shipment: Pick<Shipment, "accountId" | "originSiteId">,
): boolean {
  if (actor.kind === "external") return shipment.accountId === actor.accountId;
  const siteOk = actor.siteIds === "all" || actor.siteIds.includes(shipment.originSiteId);
  const accountOk = actor.accountIds === "all" || actor.accountIds.includes(shipment.accountId);
  return siteOk && accountOk;
}
