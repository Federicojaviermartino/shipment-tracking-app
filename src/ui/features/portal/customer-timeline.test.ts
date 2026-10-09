import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { customerTimeline } from "./customer-timeline";

type World = Awaited<ReturnType<typeof startEstela>>;

// The timeline of one shipment, as Mariana Olvera's page would feed it to the kit.
async function timelineOf({ estela, mariana }: World, shipmentId: string) {
  const shipment = await estela.portal.shipment(mariana, shipmentId);
  if (!shipment) {
    throw new Error(`Mariana cannot see ${shipmentId}.`);
  }
  return customerTimeline(shipment);
}

describe("customerTimeline", () => {
  test("puts the Now rule under the last milestone the cargo reached", async () => {
    const world = await startEstela();

    const timeline = await timelineOf(world, "EST-4058");

    expect(timeline.now?.after).toBe("VESSEL_DEPARTED@VALENCIA");
  });

  test("keeps the Now rule above an arrival still to come when the import entry is lodged ahead of it", async () => {
    const world = await startEstela();
    await world.receive({
      operatorId: "TGF",
      channel: "report",
      body: [
        "expediente;ref_cliente;concepto;estado;fecha;observaciones",
        "TGF-26-03412;12345;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;07/10/2026;",
      ].join("\n"),
    });

    const timeline = await timelineOf(world, "EST-4058");

    expect(timeline.entries.map((entry) => [entry.id, entry.mark])).toEqual(
      expect.arrayContaining([
        ["VESSEL_ARRIVED@VERACRUZ", "declared"],
        ["IMPORT_LODGED@VERACRUZ", "confirmed"],
      ]),
    );
    expect(timeline.now?.after).toBe("VESSEL_DEPARTED@VALENCIA");
  });

  test("draws no Now rule once the shipment is delivered", async () => {
    const world = await startEstela();

    const timeline = await timelineOf(world, "EST-4019");

    expect(timeline.now).toBeUndefined();
  });
});
