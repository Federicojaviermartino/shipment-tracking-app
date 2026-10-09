import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { HOUR, localDate, MINUTE } from "@/domain/time";

/**
 * The world as the clock moves and nobody reports or acts: local midnight at a destination and an
 * export cut-off. No event arrives in these tests; only time passes.
 */

/**
 * EST-4143: out for delivery, committed Wed 7 Oct, the carrier's own door estimate is Wed 7 Oct
 * 17:00. Nothing more is reported. The clock moves to Thu 8 Oct 01:00 in Colomiers.
 */
describe("a carrier's door date that has already passed is not the best date any more", () => {
  test("operations are not offered a notice that announces yesterday", async () => {
    const world = await startEstela();
    world.clock.advance(9 * HOUR);
    const ops = await world.estela.ops.shipment(world.marta, "EST-4143");
    expect(ops).toMatchObject({ health: "delayed", case: { type: "delay" } });
    const today = localDate(world.estela.now(), ops?.dates.zone ?? "Europe/Paris");
    expect(today).toBe("2026-10-08");

    // The one date of the row, and the date a notice would publish, cannot be a day that is over.
    expect(ops?.dates.best === null || (ops?.dates.best.day ?? "") >= today).toBe(true);
    const draft = await world.estela.ops.draft(world.marta, "EST-4143", "notify_customer");
    expect(draft?.publishes === null || (draft?.publishes?.day ?? "") >= today).toBe(true);
    expect(draft?.subject).not.toContain("delivery moved to Wed 7 Oct");
  });

  test("the customer does not read a missed date as the current estimate, 'on the committed date'", async () => {
    const world = await startEstela();
    world.clock.advance(9 * HOUR);
    const portal = await world.estela.portal.shipment(world.camille, "EST-4143");
    expect(portal?.published).toMatchObject({ kind: "under_review", was: "2026-10-07" });
    expect(portal?.difference).toBeNull();
    expect(portal?.verdict).not.toBe("on_time");
  });
});

/**
 * EST-4116: the commercial invoice is missing and the export cut-off for NORAY DENEB is Thu 8 Oct
 * 12:00 in Valencia. Nobody sends the invoice and nothing is released.
 */
describe("an export cut-off that passes with its document still missing", () => {
  test("the shipment does not turn green at the moment it misses its vessel", async () => {
    const world = await startEstela();
    const before = await world.estela.ops.shipment(world.marta, "EST-4116");
    expect(before).toMatchObject({ health: "at_risk", case: { type: "cutoff_risk" } });
    expect(before?.case?.why).toContain("Missing NORAY DENEB means the next sailing");
    expect(before?.case?.clock?.label).toBe("Cut-off in 20 h");

    world.clock.advance(20 * HOUR + MINUTE);
    const after = await world.estela.ops.shipment(world.marta, "EST-4116");
    expect(after?.documents.find((d) => d.docType === "commercial_invoice")?.status).toBe(
      "missing",
    );
    expect(after).toMatchObject({ health: "at_risk", case: { type: "cutoff_risk" } });
    expect(after?.case?.clock?.label).toBe("Cut-off passed");
    expect(after?.case?.title).toBe("At risk: export cut-off passed");

    const portal = await world.estela.portal.shipment(world.mariana, "EST-4116");
    expect(portal?.verdict).not.toBe("on_time");
  });

  test("the message that goes with the invoice no longer asks to lodge before a cut-off that is gone", async () => {
    const world = await startEstela();
    const inTime = await world.estela.ops.draft(world.marta, "EST-4116", "send_document");
    expect(inTime?.body).toContain("before the cut-off on Thu 8 Oct 12:00");

    world.clock.advance(20 * HOUR + MINUTE);
    const late = await world.estela.ops.draft(world.marta, "EST-4116", "send_document");
    expect(late?.body).not.toContain("before the cut-off");
    expect(late?.body).toContain("Please lodge the export declaration as soon as possible.");
  });
});
