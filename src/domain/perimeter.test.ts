import { describe, expect, test } from "vitest";
import { inScope, type Actor } from "./perimeter";

const shipments = [
  { id: "bilbao-to-mexico", originSiteId: "BIO", accountId: "AQB" },
  { id: "zaragoza-to-mexico", originSiteId: "ZAZ", accountId: "AQB" },
  { id: "bilbao-to-germany", originSiteId: "BIO", accountId: "IDE" },
  { id: "valencia-to-france", originSiteId: "VLC", accountId: "VAU" },
];

const visibleTo = (actor: Actor) =>
  shipments.filter((shipment) => inScope(actor, shipment)).map((shipment) => shipment.id);

const internal = {
  kind: "internal",
  userId: "someone",
  name: "Someone",
  title: "Coordinator",
  role: "logistics",
} as const;

describe("perimeter", () => {
  test("an internal actor with every site and every account sees everything", () => {
    expect(visibleTo({ ...internal, siteIds: "all", accountIds: "all" })).toHaveLength(4);
  });

  test("a site-scoped actor sees the shipments of that site, whatever the account", () => {
    expect(visibleTo({ ...internal, siteIds: ["BIO"], accountIds: "all" })).toEqual([
      "bilbao-to-mexico",
      "bilbao-to-germany",
    ]);
  });

  test("an account-scoped actor sees those accounts, whatever the site", () => {
    expect(
      visibleTo({
        ...internal,
        role: "customer_support",
        siteIds: "all",
        accountIds: ["AQB", "VAU"],
      }),
    ).toEqual(["bilbao-to-mexico", "zaragoza-to-mexico", "valencia-to-france"]);
  });

  test("site and account must both match", () => {
    expect(visibleTo({ ...internal, siteIds: ["BIO"], accountIds: ["AQB"] })).toEqual([
      "bilbao-to-mexico",
    ]);
    expect(visibleTo({ ...internal, siteIds: [], accountIds: "all" })).toEqual([]);
  });

  test("an external actor sees the shipments of their own account and nothing else", () => {
    const customer: Actor = {
      kind: "external",
      userId: "mariana.olvera",
      name: "Mariana Olvera",
      title: "Purchasing Coordinator",
      accountId: "AQB",
    };
    expect(visibleTo(customer)).toEqual(["bilbao-to-mexico", "zaragoza-to-mexico"]);
  });

  test("a subsidiary is an account like any other", () => {
    const subsidiary: Actor = {
      kind: "external",
      userId: "jonas.weber",
      name: "Jonas Weber",
      title: "Warehouse Lead",
      accountId: "IDE",
    };
    expect(visibleTo(subsidiary)).toEqual(["bilbao-to-germany"]);
  });
});
