import { describe, expect, test } from "vitest";
import { InMemoryEventStore } from "@/adapters/memory/in-memory-event-store";
import { createEstela } from "@/composition/create-estela";
import { startEstela } from "@/composition/test-support";
import { MINUTE } from "@/domain/time";
import { T0 } from "@/fixtures";
import type { CommandResult } from "./estela";
import type { Change } from "./views";

/**
 * The stories of the demo, end to end through the gateway: an operator event comes in as raw
 * text, a person decides, and both roles see what they are entitled to. Time moves between the
 * steps, as it does in a session.
 */

type Started = Awaited<ReturnType<typeof startEstela>>;

async function start() {
  const world = await startEstela();
  const changes: Change[] = [];
  world.estela.subscribe(world.marta, (change) => changes.push(change));
  const later = () => world.clock.advance(5 * MINUTE);
  return { ...world, changes, later };
}

/** Marta reviews the draft of a customer notice and approves it as written. */
async function approveNotice(world: Started, shipmentId: string): Promise<CommandResult> {
  const draft = await world.estela.ops.draft(world.marta, shipmentId, "notify_customer");
  if (!draft) throw new Error(`No notice to draft for ${shipmentId}`);
  return world.estela.ops.execute(world.marta, {
    type: "send_notice",
    shipmentId,
    exception: draft.exception,
    subject: draft.subject,
    body: draft.body,
    expectedDay: draft.publishes?.day ?? null,
  });
}

async function sendCorrectedInvoice(world: Started): Promise<CommandResult> {
  const draft = await world.estela.ops.draft(world.marta, "EST-4012", "send_document");
  if (!draft?.attachment) throw new Error("No document to draft for EST-4012");
  return world.estela.ops.execute(world.marta, {
    type: "send_document",
    shipmentId: "EST-4012",
    exception: draft.exception,
    docType: draft.attachment.docType,
    fileName: draft.attachment.suggestedFileName,
    subject: draft.subject,
    body: draft.body,
  });
}

async function reviewReading(world: Started, accepted: boolean): Promise<CommandResult> {
  const view = await world.estela.ops.shipment(world.marta, "EST-4012");
  const eventKey = view?.case?.reading?.eventKey;
  if (!eventKey) throw new Error("EST-4012 has no reading to review");
  return world.estela.ops.execute(world.marta, {
    type: "confirm_reading",
    shipmentId: "EST-4012",
    eventKey,
    accepted,
  });
}

describe("demo event A: the vessel is delayed at Veracruz", () => {
  test("one vessel message fans out to the two shipments aboard", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    expect(world.changes).toHaveLength(1);
    expect(world.changes[0]?.shipmentIds).toEqual(["EST-4058", "EST-4063"]);
    for (const id of ["EST-4058", "EST-4063"]) {
      const view = await world.estela.ops.shipment(world.marta, id);
      const arrival = view?.timeline.sections
        .flatMap((section) => section.entries)
        .find((entry) => entry.type === "milestone" && entry.code === "VESSEL_ARRIVED");
      expect(arrival?.type === "milestone" && arrival.operatorEstimate, id).toMatchObject({
        by: "Noray Lines",
        original: { id: "demo-A-1", channelLabel: "API" },
      });
    }
  });

  test("EST-4058 becomes at risk on a declared basis, with an Estela estimate for Fri 16 Oct and a window to Mon 19 Oct", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view).toMatchObject({ health: "at_risk" });
    expect(view?.case).toMatchObject({
      type: "predicted_delay",
      basis: "declared",
      state: "needs_action",
      clock: { kind: "now", label: "Now", detail: "Customer not yet told" },
    });
    expect(view?.case?.steps.map((step) => step.kind)).toEqual(["notify_customer"]);
    expect(view?.dates.estela).toMatchObject({
      kind: "estimate",
      day: "2026-10-16",
      window: { earliest: "2026-10-16", latest: "2026-10-19" },
      lateBy: 1,
      headline: "Delivery estimate Fri 16 Oct (was Wed 14 Oct).",
      firmsUp: "Firms up when the vessel berths.",
    });
  });

  test("the operator's Wed 14 Oct is superseded, still shown, and no longer the best date", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view?.dates.operator).toMatchObject({
      day: "2026-10-14",
      by: "Turia Global Forwarding",
      superseded: true,
      supersededNote: "declared Tue 6 Oct, before the vessel delay",
    });
    expect(view?.dates.best).toMatchObject({ day: "2026-10-16", provenance: "estimated" });
  });

  test("the chain behind the estimate says where each time comes from", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    const estimate = view?.dates.estela;
    expect(
      estimate?.kind === "estimate" && estimate.steps.map((s) => [s.label, s.fromLabel]),
    ).toEqual([
      ["Vessel berths at Veracruz", "declared by Noray Lines"],
      ["Discharge", "lane plan"],
      ["Import entry lodged", "lane plan"],
      ["Import customs release", "lane plan"],
      ["Gate-out at Veracruz", "lane plan"],
      ["Delivery in Querétaro", "lane plan"],
    ]);
  });

  test("EST-4063, on the same vessel, moves to Fri 16 Oct and gains no exception", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    const view = await world.estela.ops.shipment(world.marta, "EST-4063");
    expect(view).toMatchObject({ health: "on_time", case: null, cases: [] });
    expect(view?.dates.estela).toMatchObject({ day: "2026-10-16", lateBy: -4 });
  });

  test("the feed notice says 2 affected, 1 needs a customer notice", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    expect(world.changes[0]?.notice).toMatchObject({
      operatorName: "Noray Lines",
      affected: 2,
      needNotice: 1,
      resolved: [],
      filter: { vessel: "NORAY ALTAIR" },
    });
    expect(world.changes[0]?.notice?.headline).toContain(
      "NORAY ALTAIR now due in Veracruz Sun 11 Oct, 2 days later",
    );
    expect(world.changes[0]?.notice?.text).toMatch(
      /^Noray Lines: NORAY ALTAIR now due .* 2 shipments affected, 1 needs a customer notice\.$/,
    );
  });

  test("Mariana reads no verdict claim and a date under review: never the unapproved estimate", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    const view = await world.estela.portal.shipment(world.mariana, "EST-4058");
    expect(view).toMatchObject({
      verdict: "in_progress",
      verdictLabel: "At sea",
      published: {
        kind: "under_review",
        was: "2026-10-14",
        line: "Delivery date under review (was Wed 14 Oct)",
      },
      notices: [],
    });
    expect(JSON.stringify(view)).not.toContain("2026-10-16");
    // The vessel's new arrival is an operator's own statement: it flows without approval.
    const arrival = view?.milestones.find((milestone) => milestone.code === "VESSEL_ARRIVED");
    expect(arrival?.when?.kind).toBe("estimated");
  });

  test("an event asked for twice at once is sent once", async () => {
    // A clock that never gives the same instant twice, as a real one would not.
    let now = T0;
    const store = new InMemoryEventStore();
    const estela = await createEstela({ clock: { now: () => (now += 1) }, store, aiLatencyMs: 0 });
    await Promise.all([estela.demo.send("A"), estela.demo.send("A")]);
    const estimates = store
      .events()
      .filter((event) => event.kind === "operator" && event.rawId === "demo-A-1");
    expect(estimates.map((event) => event.shipmentId)).toEqual(["EST-4058", "EST-4063"]);
  });

  test("an event that was sent cannot be sent again", async () => {
    const world = await start();
    await world.estela.demo.send("A");
    const logged = world.store.events().length;
    expect(world.estela.demo.events()[0]).toMatchObject({ id: "A", state: "sent" });
    world.later();
    await world.estela.demo.send("A");
    expect(world.store.events()).toHaveLength(logged);
    expect(world.changes).toHaveLength(1);
  });
});

describe("the notice: a prediction reaches the customer only once a named person approves it", () => {
  test("the draft says what approving will change, from the record and not from its wording", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    const draft = await world.estela.ops.draft(world.marta, "EST-4058", "notify_customer");
    expect(draft).toMatchObject({
      audience: "customer",
      title: "Customer notice",
      to: { name: "Aquabajío Ingeniería" },
      subject: "Order 12345: new delivery estimate, Fri 16 Oct",
      writtenByAi: true,
      publishes: { day: "2026-10-16", basis: "estela_estimate" },
      changes: {
        from: { verdict: "in_progress", published: { kind: "under_review" } },
        to: {
          verdict: "delayed",
          published: {
            kind: "estimated",
            day: "2026-10-16",
            line: "Estimated by Ibón logistics, approved by Marta Soler",
          },
        },
      },
    });
  });

  test("after Marta sends it, Mariana sees Delayed, Fri 16 Oct, estimated by Ibón logistics and approved by Marta Soler", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    world.later();
    expect(await approveNotice(world, "EST-4058")).toEqual({
      ok: true,
      message: "Notice sent. Aquabajío Ingeniería now sees Fri 16 Oct.",
    });

    const view = await world.estela.portal.shipment(world.mariana, "EST-4058");
    expect(view).toMatchObject({
      verdict: "delayed",
      verdictLabel: "Delayed",
      published: {
        kind: "estimated",
        day: "2026-10-16",
        by: "notice",
        approvedBy: "Marta Soler",
        line: "Estimated by Ibón logistics, approved by Marta Soler",
      },
      difference: "one day later than committed",
      reason: "Order 12345: new delivery estimate, Fri 16 Oct",
    });
    expect(view?.notices[0]).toMatchObject({
      approvedBy: "Marta Soler",
      subject: "Order 12345: new delivery estimate, Fri 16 Oct",
    });

    const home = await world.estela.portal.home(world.mariana);
    expect(home.notices[0]).toMatchObject({ shipmentId: "EST-4058", verdict: "delayed" });
    expect(home.attention.map((card) => card.id)).toEqual(["EST-4058"]);
    expect(home.summary).toBe("7 shipments on the way. 1 needs your attention.");
  });

  test("the step is done, the case waits, and the notice is on record with its approver", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    world.later();
    await approveNotice(world, "EST-4058");

    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view?.case).toMatchObject({
      state: "waiting",
      nextStep: null,
      waiting: "Your part is done. Waiting on the next operator update.",
    });
    expect(view?.case?.steps[0]).toMatchObject({ state: "done", done: { by: "Marta Soler" } });
    expect(view?.messages[0]).toMatchObject({
      kind: "customer_notice",
      by: "Marta Soler",
      publishedDay: "2026-10-16",
    });
    expect(view?.customerSees).toMatchObject({ verdict: "delayed" });
    expect(await world.estela.ops.shipments(world.marta, { view: "waiting" })).toHaveLength(1);
    // Both the notice and what it changed were announced.
    expect(world.changes.at(-1)).toEqual({ shipmentIds: ["EST-4058"], notice: null });
  });

  test("the customer's home lists notices newest first, across shipments", async () => {
    const world = await start();
    world.later();
    await reviewReading(world, true);
    world.later();
    await approveNotice(world, "EST-4012");
    world.later();
    await world.estela.demo.send("A");
    world.later();
    await approveNotice(world, "EST-4058");
    const home = await world.estela.portal.home(world.mariana);
    expect(home.notices.map((notice) => notice.shipmentId)).toEqual(["EST-4058", "EST-4012"]);
    expect(home.attention.map((card) => card.id).sort()).toEqual(["EST-4012", "EST-4058"]);
  });

  test("a notice may mention today's date: the day it is written on is part of the record", async () => {
    const world = await start();
    const draft = await world.estela.ops.draft(world.marta, "EST-4128", "notify_customer");
    const result = await world.estela.ops.execute(world.marta, {
      type: "send_notice",
      shipmentId: "EST-4128",
      exception: "delay",
      subject: draft?.subject ?? "",
      body: `Status on Wed 7 Oct: ${draft?.body}`,
      expectedDay: draft?.publishes?.day ?? null,
    });
    expect(result.ok).toBe(true);
  });

  test("a notice is refused when the estimate moved while its draft was open", async () => {
    const world = await start();
    const draft = await world.estela.ops.draft(world.marta, "EST-4134", "notify_customer");
    const result = await world.estela.ops.execute(world.marta, {
      type: "send_notice",
      shipmentId: "EST-4134",
      exception: "predicted_delay",
      subject: draft?.subject ?? "",
      body: draft?.body ?? "",
      expectedDay: "2026-10-12",
    });
    expect(result).toEqual({
      ok: false,
      reason: "outdated",
      message: "The estimate changed while this draft was open. Reload the draft.",
    });
  });

  test("a notice that mentions a date the record does not hold is refused, and names it", async () => {
    const world = await start();
    const draft = await world.estela.ops.draft(world.marta, "EST-4128", "notify_customer");
    const result = await world.estela.ops.execute(world.marta, {
      type: "send_notice",
      shipmentId: "EST-4128",
      exception: "delay",
      subject: draft?.subject ?? "",
      body: `${draft?.body} We expect it at the latest on 18 Oct.`,
      expectedDay: draft?.publishes?.day ?? null,
    });
    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: "This date is not in the shipment record: 18 Oct.",
    });
    const view = await world.estela.ops.shipment(world.marta, "EST-4128");
    expect(view?.messages).toEqual([]);
    expect(view?.customerSees.published).toMatchObject({ kind: "estimated", by: "carrier" });
  });
});

describe("demo event B: the forwarder confirms the date Estela had estimated", () => {
  test("B is held back until A was sent", async () => {
    const world = await start();
    expect(world.estela.demo.events()[1]).toMatchObject({ id: "B", state: "blocked" });
    await world.estela.demo.send("B");
    expect(world.changes).toEqual([]);
    await world.estela.demo.send("A");
    expect(world.estela.demo.events()[1]).toMatchObject({ id: "B", state: "ready" });
  });

  test("the same date now carries operator provenance and the health is Delayed", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    world.later();
    await world.estela.demo.send("B");
    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view).toMatchObject({ health: "delayed" });
    expect(view?.case).toMatchObject({ type: "delay", basis: "declared" });
    expect(view?.dates.operator).toMatchObject({
      day: "2026-10-16",
      by: "Turia Global Forwarding",
      superseded: false,
    });
    expect(view?.dates.best).toMatchObject({
      day: "2026-10-16",
      provenance: "declared",
      by: "Turia Global Forwarding",
    });
    expect(view?.dates.estela).toMatchObject({ day: "2026-10-16", agreesWithOperator: true });
  });

  test("no second notice is proposed when one was already sent with that date", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    world.later();
    await approveNotice(world, "EST-4058");
    world.later();
    await world.estela.demo.send("B");

    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view?.case).toMatchObject({ type: "delay", state: "waiting", nextStep: null });
    expect(view?.case?.steps).toMatchObject([{ kind: "notify_customer", state: "done" }]);
    const queue = await world.estela.ops.shipments(world.marta, { view: "attention" });
    expect(queue.map((row) => row.id)).not.toContain("EST-4058");
    expect(world.changes.at(-1)?.notice).toMatchObject({ affected: 2, needNotice: 0 });

    // The carrier's own statement is now the more recent one: the customer reads it as such.
    const portal = await world.estela.portal.shipment(world.mariana, "EST-4058");
    expect(portal).toMatchObject({
      verdict: "delayed",
      published: { kind: "estimated", day: "2026-10-16", by: "carrier" },
    });
  });

  test("without a notice, the customer hears the delay from the carrier's own date, and the step stays open", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    world.later();
    await world.estela.demo.send("B");
    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view?.case).toMatchObject({ type: "delay", state: "needs_action" });
    expect(world.changes.at(-1)?.notice).toMatchObject({ needNotice: 1 });
    expect(await world.estela.portal.shipment(world.mariana, "EST-4058")).toMatchObject({
      verdict: "delayed",
      published: { kind: "estimated", day: "2026-10-16", line: "Estimated by the carrier" },
    });
  });
});

describe("the customs hold: an AI reading waits for a person", () => {
  test("until it is confirmed, the customer sees no hold and nothing can be sent on its strength", async () => {
    const world = await start();
    const portal = await world.estela.portal.shipment(world.mariana, "EST-4012");
    expect(portal).toMatchObject({ verdict: "in_progress", holds: [] });
    expect(JSON.stringify(portal)).not.toContain("discrepancy");

    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view?.case?.steps.map((step) => [step.kind, step.allowed, step.disabledReason])).toEqual(
      [
        ["confirm_reading", true, null],
        ["send_document", false, "Confirm the AI reading first."],
        ["notify_customer", false, "Confirm the AI reading first."],
      ],
    );
    expect(await world.estela.ops.draft(world.marta, "EST-4012", "send_document")).toBeNull();
    expect(
      await world.estela.ops.execute(world.marta, {
        type: "send_notice",
        shipmentId: "EST-4012",
        exception: "customs_hold",
        subject: "Order 48176: held at customs",
        body: "Customs is holding your shipment.",
        expectedDay: "2026-10-09",
      }),
    ).toEqual({ ok: false, reason: "invalid", message: "Confirm the AI reading first." });
  });

  test("confirming the reading makes Mariana see the hold, in fixed wording", async () => {
    const world = await start();
    world.later();
    expect(await reviewReading(world, true)).toMatchObject({ ok: true });

    const portal = await world.estela.portal.shipment(world.mariana, "EST-4012");
    expect(portal).toMatchObject({
      verdict: "on_hold",
      verdictLabel: "Held at customs",
      reason: "Customs is holding the shipment for a check.",
      holds: [{ hold: "customs", label: "Held at customs" }],
    });
    expect(JSON.stringify(portal)).not.toContain("discrepancy");

    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view?.case).toMatchObject({ needsConfirmation: false, state: "needs_action" });
    expect(view?.case?.reading).toMatchObject({ state: "ai_accepted", reviewedBy: "Marta Soler" });
    expect(view?.case?.steps.map((step) => [step.kind, step.state, step.allowed])).toEqual([
      ["confirm_reading", "done", false],
      ["send_document", "todo", true],
      ["notify_customer", "todo", true],
    ]);
  });

  test("rejecting it removes the exception and leaves the message as a note", async () => {
    const world = await start();
    world.later();
    expect(await reviewReading(world, false)).toMatchObject({ ok: true });

    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view).toMatchObject({ health: "on_time", case: null, cases: [] });
    expect(view?.stage.importGate).toBe("lodged");
    const notes = view?.timeline.sections
      .flatMap((section) => section.entries)
      .filter((entry) => entry.type === "note" && entry.status === "ai_rejected");
    expect(notes).toHaveLength(1);
    expect(notes?.[0]).toMatchObject({
      statusLabel: "AI reading rejected: shown as received",
      source: { name: "Turia Global Forwarding", original: { channelLabel: "Email" } },
    });
    expect(await world.estela.portal.shipment(world.mariana, "EST-4012")).toMatchObject({
      holds: [],
    });
  });

  test("event C is disabled until a corrected invoice was sent", async () => {
    const world = await start();
    const eventC = () => world.estela.demo.events().find((event) => event.id === "C");
    expect(eventC()).toEqual({
      id: "C",
      label: "Turia Global Forwarding · customs release, EST-4012",
      state: "blocked",
      reason: "Send the commercial invoice for EST-4012 first",
    });
    world.later();
    await reviewReading(world, true);
    expect(eventC()?.state).toBe("blocked");
    world.later();
    const sentAt = world.clock.now();
    expect(await sendCorrectedInvoice(world)).toEqual({
      ok: true,
      message: "Commercial invoice sent to Turia Global Forwarding.",
    });
    expect(eventC()?.state).toBe("ready");

    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view?.case?.steps.map((step) => step.state)).toEqual(["done", "done", "todo"]);
    expect(view?.documents.find((d) => d.docType === "commercial_invoice")).toMatchObject({
      status: "sent",
      statusLabel: "Sent, awaiting acknowledgement",
      at: sentAt,
    });
    expect(view?.messages[0]).toMatchObject({
      kind: "document",
      to: "Turia Global Forwarding",
      attachment: "commercial-invoice-48176-rev2.pdf",
    });
  });

  test("once the reading is confirmed, the invoice sent and the customer told, the case waits on customs", async () => {
    const world = await start();
    world.later();
    await reviewReading(world, true);
    world.later();
    await sendCorrectedInvoice(world);
    world.later();
    expect(await approveNotice(world, "EST-4012")).toMatchObject({ ok: true });

    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view?.case).toMatchObject({
      state: "waiting",
      waiting: "Your part is done. Waiting on customs.",
    });
    // What left the building, newest first, each with who approved it.
    expect(view?.messages.map((message) => [message.kind, message.by])).toEqual([
      ["customer_notice", "Marta Soler"],
      ["document", "Marta Soler"],
    ]);
    const hold = view?.timeline.sections
      .flatMap((section) => section.entries)
      .find((entry) => entry.type === "hold");
    expect(hold?.type === "hold" && hold.reading).toEqual({
      state: "ai_accepted",
      reviewedBy: "Marta Soler",
    });
    const queue = await world.estela.ops.shipments(world.marta, { view: "attention" });
    expect(queue.map((row) => row.id)).not.toContain("EST-4012");
  });

  test("after C the hold is cleared and the shipment has no exception", async () => {
    const world = await start();
    world.later();
    await reviewReading(world, true);
    world.later();
    await sendCorrectedInvoice(world);
    world.later();
    await world.estela.demo.send("C");

    const view = await world.estela.ops.shipment(world.marta, "EST-4012");
    expect(view).toMatchObject({ health: "on_time", case: null, cases: [] });
    expect(view?.stage.importGate).toBe("released");
    expect(view?.dates.operator).toMatchObject({ day: "2026-10-09", superseded: false });
    const hold = view?.timeline.sections
      .flatMap((section) => section.entries)
      .find((entry) => entry.type === "hold");
    expect(hold).toMatchObject({ open: false });
    expect(await world.estela.portal.shipment(world.mariana, "EST-4012")).toMatchObject({
      verdict: "on_time",
      published: { kind: "estimated", day: "2026-10-09", by: "carrier" },
    });
    expect(world.changes.at(-1)?.notice).toMatchObject({
      operatorName: "Turia Global Forwarding",
      headline: "Customs hold on EST-4012 cleared",
      affected: 1,
      needNotice: 0,
      resolved: ["EST-4012"],
      text: "Turia Global Forwarding: Customs hold on EST-4012 cleared. 1 shipment affected. Resolved by operator update: EST-4012.",
      filter: { text: "EST-4012" },
    });
  });
});

describe("demo event D: the truck reports again", () => {
  test("EST-4127 is no longer stale, has an estimate again and leaves the queue", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("D");
    const view = await world.estela.ops.shipment(world.marta, "EST-4127");
    expect(view).toMatchObject({ health: "on_time", case: null });
    expect(view?.dates.estela).toMatchObject({ kind: "estimate", day: "2026-10-08" });
    expect(view?.stage.detail).toBe("last position Besançon, FR");
    expect(view?.timeline.now.stale).toBe(false);
    const queue = await world.estela.ops.shipments(world.marta, { view: "attention" });
    expect(queue.map((row) => row.id)).not.toContain("EST-4127");
    expect(world.changes.at(-1)?.notice).toMatchObject({
      operatorName: "Eisvogel Spedition",
      headline: "EST-4127 reported at Besançon, FR",
      resolved: ["EST-4127"],
    });
  });
});

describe("time alone", () => {
  test("a shipment turns stale when an expected update is overdue, with no new event at all", async () => {
    const world = await start();
    const before = await world.estela.ops.shipment(world.marta, "EST-4140");
    expect(before?.health).toBe("on_time");
    // Its last position was Wed 7 Oct 15:35: fourteen hours of silence end at 05:35 on Thursday.
    world.clock.advance(14 * 60 * MINUTE);
    const after = await world.estela.ops.shipment(world.marta, "EST-4140");
    expect(after).toMatchObject({ health: "stale" });
    expect(after?.dates.estela?.kind).toBe("withheld");
  });

  test("resetting the demo returns the world to the seed and says so to every listener", async () => {
    const world = await start();
    world.later();
    await world.estela.demo.send("A");
    await approveNotice(world, "EST-4058");
    world.estela.demo.reset();
    const view = await world.estela.ops.shipment(world.marta, "EST-4058");
    expect(view).toMatchObject({ health: "on_time", messages: [] });
    expect(world.estela.demo.events()[0]?.state).toBe("ready");
    expect(world.changes.at(-1)).toEqual({
      shipmentIds: expect.arrayContaining(["EST-4058", "EST-4063"]),
      notice: null,
    });
  });
});
