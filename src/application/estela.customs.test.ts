import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { MINUTE } from "@/domain/time";

/**
 * Customs through the gateway, with operator messages the demo does not script: a gate that is
 * confirmed ahead of the cargo, and a hold that is not about the invoice.
 */

/** Turia lodges the import entry of EST-4058 while NORAY ALTAIR is still at sea. */
const PRE_LODGED_ENTRY = [
  "expediente;ref_cliente;concepto;estado;fecha;observaciones",
  "TGF-26-03412;12345;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;07/10/2026;",
].join("\n");

describe("a customs gate confirmed ahead of the cargo is not physical progress", () => {
  async function withPreLodgedEntry() {
    const world = await startEstela();
    world.clock.advance(5 * MINUTE);
    await world.receive({ operatorId: "TGF", channel: "report", body: PRE_LODGED_ENTRY });
    return world;
  }

  test("the vessel's arrival is still ahead, not 'not reported', and the customer keeps the port ETA", async () => {
    const world = await withPreLodgedEntry();

    const ops = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(ops?.stage.code).toBe("at_sea");
    const states = Object.fromEntries(
      (ops?.timeline.sections ?? [])
        .flatMap((section) => section.entries)
        .flatMap((entry) => (entry.type === "milestone" ? [[entry.code, entry.state]] : [])),
    );
    expect(states).toMatchObject({
      VESSEL_ARRIVED: "next",
      DISCHARGED: "upcoming",
      IMPORT_LODGED: "done",
    });

    const portal = await world.estela.portal.shipment(world.mariana, "EST-4058");
    const arrival = portal?.milestones.find((milestone) => milestone.code === "VESSEL_ARRIVED");
    expect(arrival).toMatchObject({ state: "next", when: { kind: "estimated" } });
    expect(portal?.references.map((reference) => reference.label)).toContain("Port of arrival");
  });

  test("the estimate still follows the vessel: demo event A puts EST-4058 at risk for Fri 16 Oct", async () => {
    const world = await withPreLodgedEntry();
    world.clock.advance(5 * MINUTE);
    await world.estela.demo.send("A");

    const ops = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(ops?.dates.estela).toMatchObject({ kind: "estimate", day: "2026-10-16" });
    expect(ops?.health).toBe("at_risk");
    expect(ops?.case?.type).toBe("predicted_delay");
    expect(ops?.dates.operator?.superseded).toBe(true);

    const portal = await world.estela.portal.shipment(world.mariana, "EST-4058");
    expect(portal?.verdict).not.toBe("on_time");
    expect(portal?.published.kind).toBe("under_review");
  });
});

/** Turia reports EST-4033 held for a physical inspection: nothing is wrong with any document. */
const INSPECTION_EMAIL = [
  "De: operaciones@turiaglobal.example",
  "Asunto: Exp. TGF-26-03301 / OC 48197 - Reconocimiento aduanero",
  "Nos informa nuestro agente: la mercancía queda retenida por la aduana para reconocimiento físico",
  "(semáforo rojo). Sin documentación pendiente por su parte.",
].join("\n");

describe("a customs hold that asks for no document is not treated as a wrong invoice", () => {
  async function heldForInspection() {
    const world = await startEstela();
    world.clock.advance(MINUTE);
    await world.receive({ operatorId: "TGF", channel: "email", body: INSPECTION_EMAIL });
    const pending = await world.estela.ops.shipment(world.marta, "EST-4033");
    const eventKey = pending?.case?.reading?.eventKey;
    if (!eventKey) throw new Error("EST-4033 has no reading to confirm");
    world.clock.advance(MINUTE);
    await world.estela.ops.execute(world.marta, {
      type: "confirm_reading",
      shipmentId: "EST-4033",
      eventKey,
      accepted: true,
    });
    return world;
  }

  test("the step is to ask the forwarder what customs needs: no document is proposed", async () => {
    const world = await heldForInspection();
    const view = await world.estela.ops.shipment(world.marta, "EST-4033");
    expect(view?.case).toMatchObject({ type: "customs_hold", needsConfirmation: false });
    expect(view?.case?.steps.map((step) => [step.kind, step.label])).toEqual([
      ["confirm_reading", "Confirm what the AI read in Turia Global Forwarding's email"],
      ["contact_operator", "Ask Turia Global Forwarding what customs needs to release the goods"],
      ["notify_customer", "Notify the customer"],
    ]);
    expect(await world.estela.ops.draft(world.marta, "EST-4033", "send_document")).toBeNull();

    const message = await world.estela.ops.draft(world.marta, "EST-4033", "contact_operator");
    expect(message?.subject).toBe("TGF-26-03301 / OC 48197: what does customs need?");
    expect(message?.body).toContain("Please tell us what customs needs to release the shipment");
    expect(`${message?.subject}\n${message?.body}`).not.toMatch(/invoice|deliver what/i);
  });

  test("the estimate says what it assumes, and it is not an invoice", async () => {
    const world = await heldForInspection();
    const view = await world.estela.ops.shipment(world.marta, "EST-4033");
    expect(view?.dates.estela).toMatchObject({
      kind: "estimate",
      assumption:
        "Assumes: if customs releases the goods on the next working day; what it needs is not known yet.",
    });
  });

  test("the customer notice says what is known and nothing about an invoice", async () => {
    const world = await heldForInspection();
    const notice = await world.estela.ops.draft(world.marta, "EST-4033", "notify_customer");
    expect(notice?.subject).toBe("Order 48197: held at Veracruz customs");
    expect(notice?.body).toContain("Customs is holding the goods after an inspection.");
    expect(notice?.body).toContain("We are asking our forwarder what customs needs");
    expect(`${notice?.subject}\n${notice?.body}`).not.toMatch(/invoice|document|corrected/i);
    expect(notice?.facts.map((fact) => fact.id)).not.toContain("document");
  });

  test("the seeded email, which asks for a corrected invoice, still proposes sending one", async () => {
    const world = await startEstela();
    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view?.case?.steps.map((step) => step.label)).toEqual([
      "Confirm what the AI read in Turia Global Forwarding's email",
      "Send the corrected commercial invoice to Turia Global Forwarding",
      "Notify the customer",
    ]);
  });
});
