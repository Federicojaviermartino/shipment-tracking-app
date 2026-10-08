import { describe, expect, test } from "vitest";
import { OPERATOR_ADAPTERS } from "@/adapters/operators";
import { startEstela } from "@/composition/test-support";
import { MINUTE } from "@/domain/time";
import { SHIPMENTS } from "@/fixtures";
import { createIngestion } from "./ingestion";
import type { OpsShipmentView, RouteView, TimelineEntryView } from "./views";

/**
 * What a screen is handed, beyond status and dates: where the cargo is drawn on its route, where
 * "now" falls in the timeline, and how evidence, sources and raw messages hang together.
 */

function place(route: RouteView): string {
  if (!route.position) return "delivered";
  const { on, index } = route.position;
  return on === "stop" ? `at ${route.stops[index]?.name}` : `on leg ${index + 1}`;
}

function entries(view: OpsShipmentView): TimelineEntryView[] {
  return [...view.timeline.lead, ...view.timeline.sections.flatMap((section) => section.entries)];
}

describe("the route", () => {
  test("has one stop more than legs: the site, every port and the consignee", async () => {
    const { estela, marta } = await startEstela();
    const ocean = (await estela.ops.shipment(marta, "EST-4058"))?.route;
    expect(ocean?.stops.map((stop) => [stop.name, stop.caption, stop.gate])).toEqual([
      ["Zaragoza", "Plant", false],
      ["Valencia", "Port · export customs", true],
      ["Veracruz", "Port · import customs", true],
      ["Querétaro", "Consignee", false],
    ]);
    expect(ocean?.legs.map((leg) => [leg.mode, leg.operator])).toEqual([
      ["road", "Transportes Cierzo"],
      ["sea", "Noray Lines"],
      ["road", "Turia Global Forwarding"],
    ]);
    const road = (await estela.ops.shipment(marta, "EST-4147"))?.route;
    expect(road?.stops.map((stop) => [stop.name, stop.caption])).toEqual([
      ["Riba-roja de Túria", "Warehouse"],
      ["El Ejido", "Consignee"],
    ]);
    expect(road?.legs).toHaveLength(1);
  });

  test("places the cargo by its furthest confirmed physical milestone", async () => {
    const { estela, marta } = await startEstela();
    const where = async (id: string) =>
      place((await estela.ops.shipment(marta, id))?.route as RouteView);
    // Booked, picked up, in the origin terminal, at sea, arrived, gated out, delivered.
    expect(await where("EST-4147")).toBe("at Riba-roja de Túria");
    expect(await where("EST-4122")).toBe("on leg 1");
    expect(await where("EST-4116")).toBe("at Valencia");
    expect(await where("EST-4058")).toBe("on leg 2");
    expect(await where("EST-4012")).toBe("at Veracruz");
    expect(await where("EST-4036")).toBe("on leg 3");
    expect(await where("EST-4019")).toBe("delivered");
    // A stop nobody planned still counts: the truck went back to a platform on the same road.
    expect(await where("EST-4128")).toBe("on leg 1");
  });

  test("a vessel that has arrived is at the port, not at sea", async () => {
    const { estela, marta, clock, store } = await startEstela();
    clock.advance(5 * MINUTE);
    // No scripted event berths the vessel: the line's own message does, through ingestion.
    const ingestion = createIngestion({
      shipments: SHIPMENTS,
      adapters: OPERATOR_ADAPTERS,
      interpreter: { read: () => Promise.resolve(null) },
      store,
    });
    await ingestion.ingest([
      {
        id: "noray-altair-berthed",
        operatorId: "NRY",
        channel: "api",
        receivedAt: clock.now(),
        body: JSON.stringify({
          eventType: "TRANSPORT",
          transportEventTypeCode: "ARRI",
          eventClassifierCode: "ACT",
          eventDateTime: "2026-10-07T07:50:00-06:00",
          UNLocationCode: "MXVER",
          vesselName: "NORAY ALTAIR",
          carrierVoyageNumber: "612W",
        }),
      },
    ]);
    const view = await estela.ops.shipment(marta, "EST-4058");
    expect(view?.stage.code).toBe("at_destination_port");
    expect(view?.timeline.now).toMatchObject({
      sectionId: "sea",
      afterEntryId: "VESSEL_ARRIVED@VERACRUZ",
    });
    expect(place(view?.route as RouteView)).toBe("at Veracruz");
  });

  test("marks the problem where it is: on the position, or on the sailing a cut-off puts at risk", async () => {
    const { estela, marta } = await startEstela();
    const marks = async (id: string) => {
      const route = (await estela.ops.shipment(marta, id))?.route;
      return {
        stops: route?.stops.map((stop) => stop.problem),
        legs: route?.legs.map((leg) => leg.problem),
        stale: route?.stale,
      };
    };
    expect(await marks("EST-4012")).toEqual({
      stops: [null, null, "held", null],
      legs: [null, null, null],
      stale: false,
    });
    expect(await marks("EST-4116")).toEqual({
      stops: [null, null, null, null],
      legs: [null, "at_risk", null],
      stale: false,
    });
    expect(await marks("EST-4127")).toEqual({ stops: [null, null], legs: ["stale"], stale: true });
    expect(await marks("EST-4058")).toEqual({
      stops: [null, null, null, null],
      legs: [null, null, null],
      stale: false,
    });
  });

  test("the customer's route carries only what the customer was told", async () => {
    const { estela, mariana } = await startEstela();
    // EST-4116 is at risk internally and EST-4012 is held on an unconfirmed reading.
    for (const id of ["EST-4116", "EST-4012"]) {
      const route = (await estela.portal.shipment(mariana, id))?.route;
      expect(
        route?.stops.every((stop) => stop.problem === null),
        id,
      ).toBe(true);
      expect(
        route?.legs.every((leg) => leg.problem === null),
        id,
      ).toBe(true);
      expect(route?.label, id).not.toMatch(/risk|held|stale/);
    }
  });

  test("says the route and the position in words", async () => {
    const { estela, marta } = await startEstela();
    expect((await estela.ops.shipment(marta, "EST-4058"))?.route.label).toBe(
      "Zaragoza to Querétaro by road, sea and road. At sea between Valencia and Veracruz.",
    );
    expect((await estela.ops.shipment(marta, "EST-4019"))?.route.label).toBe(
      "Zaragoza to San Juan del Río by road, sea and road. Delivered.",
    );
  });
});

describe("the timeline", () => {
  test("the Now rule falls after the last thing that happened where the cargo is", async () => {
    const { estela, marta } = await startEstela();
    const now = async (id: string) => (await estela.ops.shipment(marta, id))?.timeline.now;
    expect(await now("EST-4058")).toEqual({
      sectionId: "sea",
      afterEntryId: "VESSEL_DEPARTED@VALENCIA",
      stale: false,
    });
    expect(await now("EST-4147")).toEqual({
      sectionId: null,
      afterEntryId: "BOOKED@RIBA-ROJA DE TURIA",
      stale: false,
    });
    expect(await now("EST-4127")).toMatchObject({ sectionId: "road", stale: true });
    // The hold was raised after the last confirmed milestone of the port: the rule follows it.
    expect((await now("EST-4012"))?.afterEntryId).toMatch(/^hold:/);
  });

  test("every source of every entry carries the raw message it was read from", async () => {
    const { estela, marta } = await startEstela();
    const view = await estela.ops.shipment(marta, "EST-4058");
    if (!view) throw new Error("EST-4058 is missing");
    const gateIn = entries(view).find((entry) => entry.id === "GATE_IN@VALENCIA");
    expect(gateIn?.type === "milestone" && gateIn.sources).toMatchObject([
      {
        name: "Noray Lines",
        original: {
          channelLabel: "API",
          body: expect.stringContaining('"equipmentReference":"NRYU4821373"'),
        },
      },
      {
        name: "Transportes Cierzo",
        original: {
          channelLabel: "CSV file",
          body: "CRZ-2290311;60;ENTRADA EN TERMINAL;VALENCIA;22/09/2026 08:25;",
        },
      },
    ]);
    for (const entry of entries(view)) {
      if (entry.type === "milestone") {
        for (const source of entry.sources) expect(source.original, entry.id).not.toBeNull();
      }
      if (entry.type === "note" || entry.type === "hold") {
        expect(entry.source.original, entry.id).not.toBeNull();
      }
    }
  });

  test("a raw message never shows another shipment's row", async () => {
    const { estela, marta } = await startEstela();
    const view = await estela.ops.shipment(marta, "EST-4063");
    if (!view) throw new Error("EST-4063 is missing");
    const bodies = entries(view).flatMap((entry) =>
      entry.type === "milestone" ? entry.sources.map((source) => source.original?.body ?? "") : [],
    );
    expect(bodies.length).toBeGreaterThan(5);
    // EST-4058 sails on the same vessel: its references must not appear here.
    for (const body of bodies) expect(body).not.toMatch(/CRZ-2290311|NRYU4821373|TGF-26-03412/);
  });

  test("a milestone still ahead shows what the operator, the plan and Estela each say", async () => {
    const { estela, marta, clock } = await startEstela();
    clock.advance(5 * MINUTE);
    await estela.demo.send("A");
    const view = await estela.ops.shipment(marta, "EST-4058");
    if (!view) throw new Error("EST-4058 is missing");
    const arrival = entries(view).find((entry) => entry.id === "VESSEL_ARRIVED@VERACRUZ");
    const delivery = entries(view).find((entry) => entry.id === "DELIVERED@QUERETARO");
    expect(arrival).toMatchObject({
      state: "next",
      actual: null,
      operatorEstimate: { by: "Noray Lines", remark: expect.stringContaining("Port closed") },
    });
    if (arrival?.type !== "milestone" || delivery?.type !== "milestone") throw new Error("?");
    expect(arrival.planned?.at).toBeLessThan(arrival.operatorEstimate?.when.at ?? 0);
    expect(arrival.estela?.at).toBe(arrival.operatorEstimate?.when.at);
    // The forwarder's door date stands in the timeline next to the later one Estela computes.
    expect(delivery.operatorEstimate?.by).toBe("Turia Global Forwarding");
    expect(delivery.estela?.at).toBeGreaterThan(delivery.operatorEstimate?.when.at ?? 0);
    expect(delivery.estela?.precision).toBe("day");
  });

  test("a last known position is marked as overdue only on a shipment that is stale", async () => {
    const { estela, marta } = await startEstela();
    const position = async (id: string) => {
      const view = await estela.ops.shipment(marta, id);
      return view ? entries(view).find((entry) => entry.type === "position") : undefined;
    };
    expect(await position("EST-4127")).toMatchObject({ lastPlace: "La Jonquera, ES", stale: true });
    expect(await position("EST-4140")).toMatchObject({ lastPlace: "Nîmes, FR", stale: false });
  });

  test("what our own people did is in the timeline, by name", async () => {
    const { estela, marta, clock } = await startEstela();
    clock.advance(5 * MINUTE);
    await estela.ops.execute(marta, {
      type: "send_notice",
      shipmentId: "EST-4128",
      exception: "delay",
      subject: "Order 20561: delivery moved to Thu 8 Oct",
      body: "The carrier now plans delivery in Murcia on Thu 8 Oct.",
      expectedDay: "2026-10-08",
    });
    const view = await estela.ops.shipment(marta, "EST-4128");
    if (!view) throw new Error("EST-4128 is missing");
    expect(entries(view).filter((entry) => entry.type === "action")).toMatchObject([
      {
        label: "Customer notice sent: Order 20561: delivery moved to Thu 8 Oct",
        by: "Marta Soler",
        when: { zone: "Europe/Madrid", precision: "minute" },
      },
    ]);
  });
});

describe("a case", () => {
  test("each evidence line that rests on an event points to its timeline entry", async () => {
    const { estela, marta } = await startEstela();
    const queue = await estela.ops.shipments(marta, { view: "attention" });
    let linked = 0;
    for (const row of queue) {
      const view = await estela.ops.shipment(marta, row.id);
      if (!view) continue;
      const ids = new Set(entries(view).map((entry) => entry.id));
      for (const line of view.cases.flatMap((item) => item.evidence)) {
        if (line.entryId === null) continue;
        expect(ids.has(line.entryId), `${row.id}: ${line.text}`).toBe(true);
        expect(line.receivedAt, `${row.id}: ${line.text}`).not.toBeNull();
        linked += 1;
      }
    }
    expect(linked).toBeGreaterThanOrEqual(4);
  });

  test("evidence says where it comes from: an operator, a rule, a model reading or Estela's estimate", async () => {
    const { estela, marta } = await startEstela();
    const evidence = async (id: string) =>
      (await estela.ops.shipment(marta, id))?.case?.evidence.map((line) => [
        line.provenance,
        line.source,
      ]);
    // Declared late by the carrier, and the committed day has passed as well.
    expect(await evidence("EST-4128")).toEqual([
      ["declared", "Transportes Cierzo"],
      ["rule", null],
    ]);
    expect(await evidence("EST-4012")).toEqual([["ai_reading", "Turia Global Forwarding"]]);
    expect(await evidence("EST-4116")).toEqual([
      ["rule", null],
      ["rule", null],
    ]);
    expect(await evidence("EST-4134")).toEqual([
      ["estimated", null],
      ["declared", "Eisvogel Spedition"],
    ]);
  });

  test("the row carries the primary case and the first step still to take", async () => {
    const { estela, marta } = await startEstela();
    const [first] = await estela.ops.shipments(marta, { view: "attention" });
    expect(first).toMatchObject({
      id: "EST-4128",
      lane: "Zaragoza → Murcia, ES",
      account: { id: "THA", name: "Riegos Thader, S.L.", type: "customer" },
      case: {
        primary: true,
        title: "Delayed: declared two days after the committed date",
        why: "Transportes Cierzo declares delivery Thu 8 Oct, two days after the committed Tue 6 Oct.",
        nextStep: { kind: "notify_customer", action: "Review notice", allowed: true },
      },
      otherCases: 0,
      lastUpdate: { by: "Transportes Cierzo" },
    });
    expect(first?.dates.best).toMatchObject({
      day: "2026-10-08",
      provenance: "declared",
      by: "Transportes Cierzo",
      lateBy: 2,
    });
  });

  test("the portfolio lists what needs the reader first, then what waits, then the rest by committed date, delivered last", async () => {
    const { estela, marta, clock } = await startEstela();
    clock.advance(5 * MINUTE);
    // Marta asks Eisvogel about the silent truck: her part of that case is done.
    await estela.ops.execute(marta, {
      type: "contact_operator",
      shipmentId: "EST-4127",
      exception: "stale",
      operatorId: "EVS",
      subject: "EVS-88104588: position and ETA",
      body: "Please send the current position.",
    });
    const overview = await estela.ops.overview(marta);
    expect(overview.counts).toMatchObject({ attention: 5, waiting: 1, stale: 1 });
    expect(overview.line).toBe(
      "5 need you: 1 delayed, 2 held, 2 at risk. 1 waiting on others. 11 on plan. 4 delivered since yesterday.",
    );
    const all = await estela.ops.shipments(marta, { view: "all" });
    const kind = (row: (typeof all)[number]) =>
      row.case ? row.case.state : row.health === "delivered" ? "delivered" : "on_plan";
    expect(all.slice(0, 6).map((row) => [row.id, kind(row)])).toEqual([
      ["EST-4128", "needs_action"],
      ["EST-4134", "needs_action"],
      ["EST-4131", "needs_action"],
      ["EST-4116", "needs_action"],
      ["EST-4012", "needs_action"],
      ["EST-4127", "waiting"],
    ]);
    const rest = all.slice(6);
    expect(rest.map(kind)).toEqual([...Array(11).fill("on_plan"), ...Array(6).fill("delivered")]);
    const committed = rest.slice(0, 11).map((row) => row.dates.committed);
    expect(committed).toEqual([...committed].sort());
  });

  test("the briefing knows when an operator was last heard from, and the clock is the gateway's", async () => {
    const { estela, marta, clock } = await startEstela();
    const before = (await estela.ops.overview(marta)).lastOperatorUpdateAt ?? 0;
    expect(estela.now()).toBe(clock.now());
    expect(before).toBeLessThanOrEqual(estela.now());
    expect(before).toBeGreaterThan(estela.now() - 2 * 60 * MINUTE);

    clock.advance(5 * MINUTE);
    await estela.demo.send("D");
    expect((await estela.ops.overview(marta)).lastOperatorUpdateAt).toBe(clock.now());
    expect((await estela.ops.shipment(marta, "EST-4127"))?.lastUpdate).toEqual({
      at: clock.now(),
      by: "Eisvogel Spedition",
    });
  });

  test("a view and a filter combine, and the filter runs inside the view", async () => {
    const { estela, marta } = await startEstela();
    const attention = await estela.ops.shipments(marta, {
      view: "attention",
      filter: { destinationCountry: "MX" },
    });
    expect(attention.map((row) => row.id)).toEqual(["EST-4116", "EST-4012"]);
    const all = await estela.ops.shipments(marta, {
      view: "all",
      filter: { destinationCountry: "MX", delivered: false },
    });
    expect(all).toHaveLength(7);
    expect(all.slice(0, 2).map((row) => row.id)).toEqual(["EST-4116", "EST-4012"]);
  });
});

describe("commands that are refused", () => {
  test("customer support may not confirm or reject an AI reading", async () => {
    const { estela, marta, lucia, store } = await startEstela();
    const reading = (await estela.ops.shipment(marta, "EST-4012"))?.case?.reading;
    const before = store.events().length;
    expect(
      await estela.ops.execute(lucia, {
        type: "confirm_reading",
        shipmentId: "EST-4012",
        eventKey: reading?.eventKey ?? "",
        accepted: false,
      }),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      message: "Needs the Logistics role. Ask Marta Soler.",
    });
    expect(store.events()).toHaveLength(before);
  });

  test("only an AI reading can be reviewed: a table-mapped fact needs no confirmation", async () => {
    const { estela, marta, store } = await startEstela();
    const fact = store
      .events()
      .find((event) => event.kind === "operator" && event.shipmentId === "EST-4012");
    const result = await estela.ops.execute(marta, {
      type: "confirm_reading",
      shipmentId: "EST-4012",
      eventKey: fact?.kind === "operator" ? fact.key : "",
      accepted: false,
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  test("a message can only go to an operator that has a part in the shipment", async () => {
    const { estela, marta } = await startEstela();
    const message = {
      type: "contact_operator" as const,
      shipmentId: "EST-4127",
      exception: "stale" as const,
      subject: "EVS-88104588: position and ETA",
      body: "Please send the current position.",
    };
    expect(await estela.ops.execute(marta, { ...message, operatorId: "NRY" })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await estela.ops.execute(marta, { ...message, operatorId: "EVS" })).toEqual({
      ok: true,
      message: "Message sent to Eisvogel Spedition.",
    });
    const view = await estela.ops.shipment(marta, "EST-4127");
    expect(view?.case).toMatchObject({ state: "waiting" });
    expect(view?.messages[0]).toMatchObject({
      kind: "operator_message",
      to: "Eisvogel Spedition",
    });
  });

  test("a command for a case that is no longer open is outdated, and an empty message is invalid", async () => {
    const { estela, marta } = await startEstela();
    const notice = {
      type: "send_notice" as const,
      shipmentId: "EST-4058",
      exception: "predicted_delay" as const,
      subject: "Order 12345: new delivery estimate",
      body: "We estimate delivery later than planned.",
      expectedDay: "2026-10-14",
    };
    expect(await estela.ops.execute(marta, notice)).toEqual({
      ok: false,
      reason: "outdated",
      message: "This case is no longer open. Reload the shipment.",
    });
    expect(
      await estela.ops.execute(marta, {
        ...notice,
        shipmentId: "EST-4128",
        exception: "delay",
        expectedDay: "2026-10-08",
        body: "   ",
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });
});
