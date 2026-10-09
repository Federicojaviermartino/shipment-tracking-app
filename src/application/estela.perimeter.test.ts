import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import type { InternalActor } from "@/domain/perimeter";
import { MINUTE } from "@/domain/time";
import type { OpsCommand } from "./estela";
import type { Change } from "./views";

/**
 * Out of perimeter equals not found. The policy runs inside the gateway on every query and every
 * command, so these tests go through the gateway and nothing else.
 */

describe("queries", () => {
  test("a shipment outside the perimeter is answered exactly like one that does not exist", async () => {
    const { estela, iker, camille } = await startEstela();
    // EST-4058 leaves from Zaragoza for Aquabajío: not Iker's site, not Camille's account.
    expect(await estela.ops.shipment(iker, "EST-4058")).toBeNull();
    expect(await estela.ops.shipment(iker, "EST-0000")).toBeNull();
    expect(await estela.portal.shipment(camille, "EST-4058")).toBeNull();
    expect(await estela.portal.shipment(camille, "EST-0000")).toBeNull();
  });

  test("the same shipment is found by those who may see it", async () => {
    const { estela, marta, lucia, mariana } = await startEstela();
    expect((await estela.ops.shipment(marta, "EST-4058"))?.orderRef).toBe("12345");
    expect((await estela.ops.shipment(lucia, "EST-4058"))?.orderRef).toBe("12345");
    expect((await estela.portal.shipment(mariana, "EST-4058"))?.orderRef).toBe("12345");
  });

  test("lists, counts and filter options are computed inside the perimeter", async () => {
    const { estela, iker } = await startEstela();
    const overview = await estela.ops.overview(iker);
    expect(overview.identity).toBe("Logistics · Abadiño plant · 5 shipments");
    expect(overview.counts.all).toBe(5);
    expect(overview.filterOptions.sites).toEqual([{ id: "BIO", name: "Abadiño plant" }]);
    // The only vessel Iker's site has cargo on.
    expect(overview.filterOptions.vessels).toEqual(["NORAY CASTOR"]);

    const everything = await estela.ops.shipments(iker, { view: "all", filter: {} });
    expect(everything.every((row) => row.origin.siteId === "BIO")).toBe(true);
    // A filter that names another site finds nothing instead of widening the perimeter.
    expect(
      await estela.ops.shipments(iker, { view: "all", filter: { originSiteId: "ZAZ" } }),
    ).toEqual([]);
  });

  test("a customer only ever gets their own account's shipments", async () => {
    const { estela, marta, camille } = await startEstela();
    const home = await estela.portal.home(camille);
    const ids = [...home.attention, ...home.onTheWay, ...home.delivered].map((card) => card.id);
    const vauclair = (await estela.ops.shipments(marta, { view: "all" }))
      .filter((row) => row.account.id === "VAU")
      .map((row) => row.id);
    expect(ids.sort()).toEqual(vauclair.sort());
    expect(home.account.name).toBe("Vauclair Hydraulique SAS");
  });

  test("nothing a customer is sent names an operator: the route says how the cargo travels, not with whom", async () => {
    const { estela, marta, mariana, camille } = await startEstela();
    const operators = (await estela.ops.overview(marta)).filterOptions.operators;
    expect(operators.map((operator) => operator.name)).toEqual(
      expect.arrayContaining(["Transportes Cierzo", "Noray Lines", "Turia Global Forwarding"]),
    );

    for (const customer of [mariana, camille]) {
      const home = await estela.portal.home(customer);
      const ids = [...home.attention, ...home.onTheWay, ...home.delivered].map((card) => card.id);
      const pages = await Promise.all(ids.map((id) => estela.portal.shipment(customer, id)));
      expect(pages.length).toBeGreaterThan(3);
      const sent = JSON.stringify({ home, pages });
      for (const operator of operators) {
        expect(sent, `${customer.name}: ${operator.name}`).not.toContain(operator.name);
      }
      for (const page of pages) {
        expect(page?.route.legs.length, page?.id).toBeGreaterThan(0);
        for (const leg of page?.route.legs ?? []) {
          expect(Object.keys(leg).sort(), page?.id).toEqual(["mode", "problem"]);
        }
      }
    }
  });

  test("the operations queries answer an actor who is not staff with nothing, whatever a caller's types said", async () => {
    const { estela, mariana } = await startEstela();
    // What a wrongly narrowed persona in a component would do: at run time the type is not there.
    const customer = mariana as unknown as InternalActor;

    // EST-4012 and EST-4116 are her own account's shipments: in her perimeter, not on her desk.
    expect(await estela.ops.shipment(customer, "EST-4012")).toBeNull();
    expect(await estela.ops.shipments(customer, { view: "all" })).toEqual([]);
    expect(await estela.ops.highlight(customer)).toBeNull();
    expect(await estela.ops.draft(customer, "EST-4116", "send_document")).toBeNull();

    const asked = await estela.ops.ask(customer, "what's going on with order 48176?");
    expect(asked).toMatchObject({ kind: "not_understood", rows: [] });
    expect(JSON.stringify(asked)).not.toContain("Read by AI");
    expect(JSON.stringify(asked)).not.toContain("Estela estimate");

    const overview = await estela.ops.overview(customer);
    expect(overview.counts.all).toBe(0);
    expect(overview.filterOptions).toEqual({
      countries: [],
      sites: [],
      accounts: [],
      operators: [],
      vessels: [],
    });
    expect(estela.ops.describeFilter(customer, { operatorId: "TGF" })).toEqual([
      { field: "operatorId", label: "Operator: TGF" },
    ]);
  });
});

describe("asking", () => {
  test("an order outside the perimeter is not found, in the same words as an unknown order", async () => {
    const { estela, iker, marta } = await startEstela();
    const outside = await estela.ops.ask(iker, "what's going on with order 12345?");
    const unknown = await estela.ops.ask(iker, "what's going on with order 99999?");
    expect(outside).toEqual({
      kind: "not_found",
      reference: "12345",
      message: "No order 12345 in your shipments.",
    });
    expect(unknown).toMatchObject({
      kind: "not_found",
      message: "No order 99999 in your shipments.",
    });
    expect((await estela.ops.ask(marta, "what's going on with order 12345?")).kind).toBe("answer");
  });

  test("a filter question is answered from the asker's rows only", async () => {
    const { estela, iker, marta } = await startEstela();
    const all = await estela.ops.ask(marta, "anything stuck in customs?");
    const own = await estela.ops.ask(iker, "shipments to France");
    expect(all.kind === "filter" && all.rows.map((row) => row.id)).toEqual(["EST-4012"]);
    expect(own.kind === "filter" && own.rows.map((row) => row.id)).toEqual(["EST-4149"]);
  });

  test("a refusal does not confirm that an order exists elsewhere", async () => {
    const { estela, iker } = await startEstela();
    expect(await estela.ops.ask(iker, "how much duty did we pay on order 12345?")).toEqual({
      kind: "unsupported",
      shipmentId: null,
      message: "Estela holds tracking and documents, not duty amounts.",
    });
  });

  test("chips never resolve a name from outside the perimeter", async () => {
    const { estela, iker, marta } = await startEstela();
    const filter = { originSiteId: "ZAZ", vessel: "NORAY ALTAIR" };
    expect(estela.ops.describeFilter(marta, filter).map((chip) => chip.label)).toEqual([
      "Origin: Zaragoza plant",
      "Vessel: NORAY ALTAIR",
    ]);
    expect(estela.ops.describeFilter(iker, filter)[0]?.label).toBe("Origin: ZAZ");
  });
});

describe("commands", () => {
  const notice = (shipmentId: string): OpsCommand => ({
    type: "send_notice",
    shipmentId,
    exception: "delay",
    subject: "Order 20561: delivery moved",
    body: "The carrier now plans delivery later than committed.",
    expectedDay: "2026-10-08",
  });

  test("a command on a shipment outside the perimeter is not found, like an unknown one", async () => {
    const { estela, iker, store } = await startEstela();
    const before = store.events().length;
    // EST-4128 leaves from Zaragoza: it exists, has that case, and is not Iker's.
    expect(await estela.ops.execute(iker, notice("EST-4128"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await estela.ops.execute(iker, notice("EST-0000"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(store.events()).toHaveLength(before);
    expect(await estela.ops.draft(iker, "EST-4128", "notify_customer")).toBeNull();
  });

  test("the same command from someone who may see the shipment goes through", async () => {
    const { estela, marta } = await startEstela();
    expect(await estela.ops.execute(marta, notice("EST-4128"))).toEqual({
      ok: true,
      message: "Notice sent. Riegos Thader now sees Thu 8 Oct.",
    });
  });

  test("customer support may not send a document, and is told why and whom to ask", async () => {
    const { estela, lucia, store } = await startEstela();
    const before = store.events().length;
    const result = await estela.ops.execute(lucia, {
      type: "send_document",
      shipmentId: "EST-4116",
      exception: "cutoff_risk",
      docType: "commercial_invoice",
      fileName: "commercial-invoice-48236.pdf",
      subject: "TGF-26-03455 / OC 48236: commercial invoice for export clearance",
      body: "Attached is the commercial invoice.",
    });
    expect(result).toEqual({
      ok: false,
      reason: "forbidden",
      message: "Needs the Logistics role. Ask Marta Soler.",
    });
    expect(store.events()).toHaveLength(before);
    expect(await estela.ops.draft(lucia, "EST-4116", "send_document")).toBeNull();
  });

  test("customer support may notify the customer", async () => {
    const { estela, lucia } = await startEstela();
    const draft = await estela.ops.draft(lucia, "EST-4134", "notify_customer");
    expect(draft?.audience).toBe("customer");
    const result = await estela.ops.execute(lucia, {
      type: "send_notice",
      shipmentId: "EST-4134",
      exception: "predicted_delay",
      subject: draft?.subject ?? "",
      body: draft?.body ?? "",
      expectedDay: draft?.publishes?.day ?? null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("live updates", () => {
  test("a change is announced to those who may see it, and to nobody else", async () => {
    const { estela, clock, marta, iker, lucia, mariana, camille } = await startEstela();
    const heard = new Map<string, Change[]>();
    for (const actor of [marta, iker, lucia, mariana, camille]) {
      heard.set(actor.userId, []);
      estela.subscribe(actor, (change) => heard.get(actor.userId)?.push(change));
    }

    clock.advance(5 * MINUTE);
    // The vessel carries EST-4058 and EST-4063: Aquabajío cargo from Zaragoza and Riba-roja.
    await estela.demo.send("A");

    const both = ["EST-4058", "EST-4063"];
    expect(heard.get("marta.soler")?.map((change) => change.shipmentIds)).toEqual([both]);
    expect(heard.get("lucia.ferrer")?.map((change) => change.shipmentIds)).toEqual([both]);
    expect(heard.get("mariana.olvera")?.map((change) => change.shipmentIds)).toEqual([both]);
    expect(heard.get("iker.zabala")).toEqual([]);
    expect(heard.get("camille.roussel")).toEqual([]);
  });

  test("an operator's name and words reach operations, never a customer", async () => {
    const { estela, marta, mariana } = await startEstela();
    const changes: { ops: Change[]; customer: Change[] } = { ops: [], customer: [] };
    estela.subscribe(marta, (change) => changes.ops.push(change));
    estela.subscribe(mariana, (change) => changes.customer.push(change));
    await estela.demo.send("A");
    expect(changes.ops[0]?.notice?.operatorName).toBe("Noray Lines");
    expect(changes.customer).toEqual([{ shipmentIds: ["EST-4058", "EST-4063"], notice: null }]);
  });

  test("a notice counts and names only the shipments its listener may see", async () => {
    const { estela, clock, marta } = await startEstela();
    // Someone at the Zaragoza plant: of the two shipments aboard the vessel, only EST-4058 is theirs.
    const zaragoza: InternalActor = { ...marta, userId: "zaragoza.desk", siteIds: ["ZAZ"] };
    const heard: Change[] = [];
    estela.subscribe(zaragoza, (change) => heard.push(change));

    clock.advance(5 * MINUTE);
    await estela.demo.send("A");
    clock.advance(5 * MINUTE);
    await estela.demo.send("B");

    expect(heard.map((change) => change.shipmentIds)).toEqual([["EST-4058"], ["EST-4058"]]);
    expect(heard[0]?.notice).toMatchObject({ affected: 1, needNotice: 1 });
    expect(heard[1]?.notice).toMatchObject({
      headline: "Delivery of EST-4058 now declared for Fri 16 Oct",
      affected: 1,
      filter: { text: "EST-4058" },
    });
  });

  test("a listener that unsubscribed hears nothing more", async () => {
    const { estela, marta } = await startEstela();
    const changes: Change[] = [];
    const unsubscribe = estela.subscribe(marta, (change) => changes.push(change));
    unsubscribe();
    await estela.demo.send("A");
    expect(changes).toEqual([]);
  });

  test("a listener that throws fails alone: the others still hear the change, and its error is reported", async () => {
    const reported: unknown[] = [];
    const { estela, marta, mariana } = await startEstela({
      reportError: (error) => reported.push(error),
    });
    const heard: string[] = [];
    estela.demo.subscribe(() => {
      throw new Error("the demo bar failed");
    });
    estela.demo.subscribe(() => heard.push("demo bar"));
    estela.subscribe(marta, () => {
      throw new Error("the operations screen failed");
    });
    estela.subscribe(mariana, () => heard.push("portal"));

    await estela.demo.send("A");
    expect(heard).toEqual(["demo bar", "portal"]);
    expect(reported).toEqual([
      new Error("the demo bar failed"),
      new Error("the operations screen failed"),
    ]);
  });
});
