import type { Actor, InternalActor } from "@/domain/perimeter";
import { accountOf, shortAccountName, siteOf, type Directory } from "../directory";
import { list, plural } from "./format";

function siteNames(directory: Directory, actor: InternalActor): string[] {
  if (actor.siteIds === "all") return [];
  return actor.siteIds.map((id) => siteOf(directory, id)?.name ?? id);
}

function accountNames(directory: Directory, ids: readonly string[]): string[] {
  return ids.map((id) => {
    const account = accountOf(directory, id);
    return account ? shortAccountName(account.name) : id;
  });
}

/** What an actor may see, in words: "All sites, all accounts", "Abadiño plant". */
export function perimeterWords(directory: Directory, actor: Actor): string {
  if (actor.kind === "external") return list(accountNames(directory, [actor.accountId]));
  const sites = siteNames(directory, actor);
  const accounts = actor.accountIds === "all" ? [] : accountNames(directory, actor.accountIds);
  if (sites.length === 0 && accounts.length === 0) return "All sites, all accounts";
  if (accounts.length === 0) return list(sites);
  if (sites.length === 0) return `${list(accounts)}, any site`;
  return `${list(sites)}; ${list(accounts)}`;
}

const ROLE_LABEL: Record<InternalActor["role"], string> = {
  logistics: "Logistics",
  customer_support: "Customer support",
};

/** The second line of the identity chip: "Logistics · All sites · 23 shipments". */
export function identityLine(
  directory: Directory,
  actor: InternalActor,
  shipmentCount: number,
): string {
  const sites = siteNames(directory, actor);
  const accounts = actor.accountIds === "all" ? [] : accountNames(directory, actor.accountIds);
  const scope = [...sites, ...accounts].join(", ") || "All sites";
  return `${ROLE_LABEL[actor.role]} · ${scope} · ${plural(shipmentCount, "shipment")}`;
}
