import { describe, expect, test } from "vitest";
import { applyFilter, resolveDue, type FilterableRow, type ShipmentFilter } from "./filters";
import { at, oceanShipment, roadShipment } from "./test-support";

/** Wednesday 7 October 2026, 16:00 in Madrid. */
const NOW = at("2026-10-07 16:00");

const rows: FilterableRow[] = [
  {
    shipment: oceanShipment({ id: "EST-OCEAN", orderRef: "12345", committedDate: "2026-10-15" }),
    stage: "at_sea",
    health: "on_time",
    customsHold: false,
  },
  {
    shipment: oceanShipment({
      id: "EST-HELD",
      orderRef: "48176",
      originSiteId: "BIO",
      committedDate: "2026-10-09",
      voyage: { vessel: "NORAY CASTOR", voyage: "611W" },
    }),
    stage: "at_destination_port",
    health: "held",
    customsHold: true,
  },
  {
    shipment: roadShipment({ id: "EST-FRANCE", orderRef: "71219", committedDate: "2026-10-08" }),
    stage: "in_transit",
    health: "at_risk",
    customsHold: false,
  },
  {
    shipment: roadShipment({ id: "EST-DONE", orderRef: "71204", committedDate: "2026-10-06" }),
    stage: "delivered",
    health: "delivered",
    customsHold: false,
  },
  {
    shipment: roadShipment({ id: "EST-TODAY", orderRef: "71225", committedDate: "2026-10-07" }),
    stage: "out_for_delivery",
    health: "on_time",
    customsHold: false,
  },
  {
    shipment: roadShipment({ id: "EST-NEXT", orderRef: "71231", committedDate: "2026-10-14" }),
    stage: "booked",
    health: "on_time",
    customsHold: false,
  },
];

const ids = (filter: ShipmentFilter, now = NOW) =>
  applyFilter(rows, filter, now).map((row) => row.shipment.id);

describe("each filter dimension", () => {
  test("an empty filter keeps every row", () => {
    expect(ids({})).toHaveLength(rows.length);
  });

  test("destination country", () => {
    expect(ids({ destinationCountry: "MX" })).toEqual(["EST-OCEAN", "EST-HELD"]);
  });

  test("origin site", () => {
    expect(ids({ originSiteId: "BIO" })).toEqual(["EST-HELD"]);
  });

  test("account", () => {
    expect(ids({ accountId: "AQB" })).toEqual(["EST-OCEAN", "EST-HELD"]);
  });

  test("operator: anyone with a part in the shipment, the forwarder included", () => {
    expect(ids({ operatorId: "TGF" })).toEqual(["EST-OCEAN", "EST-HELD"]);
    expect(ids({ operatorId: "EVS" })).toEqual(["EST-FRANCE", "EST-DONE", "EST-TODAY", "EST-NEXT"]);
  });

  test("vessel, whatever the capitals", () => {
    expect(ids({ vessel: "Noray Altair" })).toEqual(["EST-OCEAN"]);
  });

  test("health and stage accept several values", () => {
    expect(ids({ health: ["delayed", "at_risk"] })).toEqual(["EST-FRANCE"]);
    expect(ids({ stage: ["at_sea", "at_destination_port"] })).toEqual(["EST-OCEAN", "EST-HELD"]);
  });

  test("customs hold", () => {
    expect(ids({ customsHold: true })).toEqual(["EST-HELD"]);
  });

  test("delivered or still open", () => {
    expect(ids({ delivered: true })).toEqual(["EST-DONE"]);
    expect(ids({ delivered: false })).not.toContain("EST-DONE");
  });

  test("text matches references and keywords, every word, whatever the accents", () => {
    expect(ids({ text: "12345" })).toEqual(["EST-OCEAN"]);
    expect(ids({ text: "nryu4821373" })).toEqual(["EST-OCEAN", "EST-HELD"]);
    expect(ids({ text: "queretaro castor" })).toEqual(["EST-HELD"]);
    expect(ids({ text: "asdf qwerty" })).toEqual([]);
  });

  test("dimensions combine with and", () => {
    expect(
      ids({ destinationCountry: "FR", due: "this_week", health: ["delayed", "at_risk"] }),
    ).toEqual(["EST-FRANCE"]);
  });
});

describe("due, resolved from now", () => {
  test("this week runs from Monday to Sunday", () => {
    expect(resolveDue("this_week", NOW)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(ids({ due: "this_week" })).toEqual(["EST-HELD", "EST-FRANCE", "EST-DONE", "EST-TODAY"]);
  });

  test("next week is the Monday to Sunday after it", () => {
    expect(resolveDue("next_week", NOW)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(ids({ due: "next_week" })).toEqual(["EST-OCEAN", "EST-NEXT"]);
  });

  test("today is the desk's today", () => {
    expect(ids({ due: "today" })).toEqual(["EST-TODAY"]);
  });

  test("the week turns over on Monday morning in Madrid, not before", () => {
    const sundayNight = at("2026-10-11 23:30");
    const mondayMorning = at("2026-10-12 00:30");
    expect(resolveDue("this_week", sundayNight).to).toBe("2026-10-11");
    expect(resolveDue("this_week", mondayMorning).from).toBe("2026-10-12");
  });
});
