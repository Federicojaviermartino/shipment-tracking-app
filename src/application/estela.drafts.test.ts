import { describe, expect, test } from "vitest";
import { ruleBasedEstimator } from "@/adapters/ai-mock/rule-based-estimator";
import { startEstela } from "@/composition/test-support";
import { dayInstant, MINUTE } from "@/domain/time";
import { ungroundedDates } from "./text/grounding";
import type { Draft } from "./views";

/**
 * Drafts are checked for what would mislead, not for their prose: every date they mention must
 * be in the fact sheet they were written from, the subject must name the reference the reader
 * files by, and customer copy must respect the incoterm and carry no fault wording. The checks
 * are written against the gateway and the port, so they hold for whatever drafter is plugged in.
 */

type Started = Awaited<ReturnType<typeof startEstela>>;

const FAULT_WORDING = /\b(fault|liab|blame|negligen|apolog|sorry|our mistake|our error)/i;
const NOTHING_TO_DO = /you do not need to do anything|no action (is )?(needed|required)/i;

/** Every draft that can be opened from the queue: each open step of each case. */
async function draftsOfTheQueue(world: Started): Promise<Draft[]> {
  const queue = await world.estela.ops.shipments(world.marta, { view: "attention" });
  const drafts: Draft[] = [];
  for (const row of queue) {
    const view = await world.estela.ops.shipment(world.marta, row.id);
    for (const item of view?.cases ?? []) {
      for (const step of item.steps) {
        const draft = await world.estela.ops.draft(world.marta, row.id, step.kind);
        if (draft) drafts.push(draft);
      }
    }
  }
  return drafts;
}

/** The demo, played up to the point where every kind of draft can be written. */
async function worlds(): Promise<{ name: string; world: Started }[]> {
  const atT0 = await startEstela();

  const afterVesselDelay = await startEstela();
  afterVesselDelay.clock.advance(5 * MINUTE);
  await afterVesselDelay.estela.demo.send("A");

  const afterConfirming = await startEstela();
  const reading = (await afterConfirming.estela.ops.shipment(afterConfirming.marta, "EST-4012"))
    ?.case?.reading;
  await afterConfirming.estela.ops.execute(afterConfirming.marta, {
    type: "confirm_reading",
    shipmentId: "EST-4012",
    eventKey: reading?.eventKey ?? "",
    accepted: true,
  });

  return [
    { name: "at T0", world: atT0 },
    { name: "after the vessel delay", world: afterVesselDelay },
    { name: "after confirming the customs reading", world: afterConfirming },
  ];
}

describe("drafts", () => {
  test("every case in the queue has a draft for each of its outbound steps", async () => {
    const [atT0] = await worlds();
    if (!atT0) throw new Error("No world");
    const drafts = await draftsOfTheQueue(atT0.world);
    expect(drafts.map((draft) => `${draft.shipmentId} ${draft.step}`)).toEqual([
      "EST-4128 notify_customer",
      "EST-4134 contact_operator",
      "EST-4134 notify_customer",
      "EST-4131 contact_operator",
      "EST-4131 notify_customer",
      "EST-4116 send_document",
      // EST-4012 offers nothing until its reading is confirmed.
      "EST-4127 contact_operator",
    ]);
    for (const draft of drafts) {
      expect(draft.writtenByAi, draft.shipmentId).toBe(true);
      expect(draft.subject.length, draft.shipmentId).toBeGreaterThan(10);
      expect(draft.body.length, draft.shipmentId).toBeGreaterThan(40);
    }
  });

  test("every date written in a draft exists in its fact sheet", async () => {
    let checked = 0;
    for (const { name, world } of await worlds()) {
      for (const draft of await draftsOfTheQueue(world)) {
        const invented = ungroundedDates(`${draft.subject}\n${draft.body}`, draft.facts);
        expect(invented, `${name}: ${draft.shipmentId} ${draft.step}`).toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });

  test("the facts a draft says it used are facts of its sheet, and it uses at least one", async () => {
    for (const { name, world } of await worlds()) {
      for (const draft of await draftsOfTheQueue(world)) {
        const used = draft.facts.filter((fact) => fact.used);
        expect(used.length, `${name}: ${draft.shipmentId} ${draft.step}`).toBeGreaterThan(0);
        expect(new Set(draft.facts.map((fact) => fact.id)).size).toBe(draft.facts.length);
      }
    }
  });

  test("the subject names the reference its reader files by", async () => {
    for (const { world } of await worlds()) {
      for (const draft of await draftsOfTheQueue(world)) {
        const view = await world.estela.ops.shipment(world.marta, draft.shipmentId);
        if (draft.audience === "customer") {
          expect(draft.subject).toContain(`Order ${view?.orderRef}`);
          continue;
        }
        const theirs = view?.references
          .filter((reference) => reference.holder === draft.to.name)
          .map((reference) => reference.value);
        expect(theirs?.some((value) => draft.subject.startsWith(value))).toBe(true);
      }
    }
  });

  test("customer drafts carry no fault wording and never say there is nothing to do", async () => {
    let customerDrafts = 0;
    for (const { world } of await worlds()) {
      for (const draft of await draftsOfTheQueue(world)) {
        if (draft.audience !== "customer") continue;
        customerDrafts += 1;
        const text = `${draft.subject}\n${draft.body}`;
        expect(text).not.toMatch(FAULT_WORDING);
        expect(text).not.toMatch(NOTHING_TO_DO);
      }
    }
    expect(customerDrafts).toBeGreaterThan(5);
  });

  test("on an import matter the customer is told what their broker may be asked for", async () => {
    const all = await worlds();
    const confirmed = all[2]?.world;
    if (!confirmed) throw new Error("No world");
    const draft = await confirmed.estela.ops.draft(confirmed.marta, "EST-4012", "notify_customer");
    expect(draft?.subject).toBe("Order 48176: held at Veracruz customs for a document check");
    expect(draft?.body).toContain("Your broker may be asked to present the corrected invoice.");
    expect(draft?.body).toContain("(4,180 kg)");
    expect(draft?.publishes).toMatchObject({ day: "2026-10-09", basis: "estela_estimate" });
  });

  test("a customer notice publishes the date of the record, and a message to an operator publishes none", async () => {
    const { estela, marta } = await startEstela();
    const notice = await estela.ops.draft(marta, "EST-4128", "notify_customer");
    expect(notice?.publishes).toMatchObject({ day: "2026-10-08", basis: "operator_estimate" });
    expect(notice?.changes).not.toBeNull();
    const message = await estela.ops.draft(marta, "EST-4127", "contact_operator");
    expect(message).toMatchObject({
      audience: "operator",
      title: "Message to Eisvogel Spedition",
      subject: "EVS-88104588: position and ETA",
      publishes: null,
      changes: null,
      operatorId: "EVS",
    });
  });

  test("the date a notice publishes is a fact of a notice only", async () => {
    const { estela, marta } = await startEstela();
    const ids = async (step: "notify_customer" | "contact_operator") =>
      (await estela.ops.draft(marta, "EST-4134", step))?.facts.map((fact) => fact.id);
    expect(await ids("notify_customer")).toContain("published");
    expect(await ids("contact_operator")).not.toContain("published");
  });

  test("of the steps an estimate assumes, only a customs release lends its day to the draft", async () => {
    const [, , confirmed] = await worlds();
    if (!confirmed) throw new Error("No world");
    const { estela, marta } = confirmed.world;
    const assumed = async (shipmentId: string) => {
      const estimate = (await estela.ops.shipment(marta, shipmentId))?.dates.estela;
      return estimate?.kind === "estimate"
        ? estimate.steps.filter((step) => step.from === "assumption").map((s) => s.milestoneKey)
        : [];
    };
    const datesOf = async (shipmentId: string) =>
      (await estela.ops.draft(marta, shipmentId, "notify_customer"))?.facts.find(
        (fact) => fact.id === "estelaDoor",
      )?.dates;

    // The release is assumed for Thu 8 Oct: a notice may say so next to the door date.
    expect(await assumed("EST-4012")).toEqual(["IMPORT_RELEASED@VERACRUZ"]);
    expect(await datesOf("EST-4012")).toEqual(["2026-10-09", "2026-10-08"]);
    // An overdue hub scan moved to now is an assumption too, and not a date to tell anybody.
    expect(await assumed("EST-4128")).toEqual(["HUB_IN@MURCIA"]);
    expect(await datesOf("EST-4128")).toEqual(["2026-10-08"]);
  });

  test("a document draft suggests the file to attach: a new revision when it corrects one", async () => {
    const all = await worlds();
    const [atT0, , confirmed] = all.map((item) => item.world);
    if (!atT0 || !confirmed) throw new Error("No world");
    const missing = await atT0.estela.ops.draft(atT0.marta, "EST-4116", "send_document");
    expect(missing).toMatchObject({
      title: "Send document to Turia Global Forwarding",
      subject: "TGF-26-03455 / OC 48236: commercial invoice for export clearance",
      attachment: {
        docType: "commercial_invoice",
        suggestedFileName: "commercial-invoice-48236.pdf",
      },
    });
    const corrected = await confirmed.estela.ops.draft(
      confirmed.marta,
      "EST-4012",
      "send_document",
    );
    expect(corrected).toMatchObject({
      subject: "TGF-26-03290 / OC 48176: corrected commercial invoice",
      attachment: { suggestedFileName: "commercial-invoice-48176-rev2.pdf" },
    });
  });

  test("when the drafter fails, the facts still stand and the message is left to be written by hand", async () => {
    const { estela, marta } = await startEstela({
      ai: { drafter: { draft: () => Promise.reject(new Error("model down")) } },
    });
    const draft = await estela.ops.draft(marta, "EST-4128", "notify_customer");
    expect(draft).toMatchObject({ writtenByAi: false, subject: "", body: "" });
    expect(draft?.facts.length).toBeGreaterThan(3);
    expect(draft?.publishes).toMatchObject({ day: "2026-10-08" });

    const sent = await estela.ops.execute(marta, {
      type: "send_notice",
      shipmentId: "EST-4128",
      exception: "delay",
      subject: "Order 20561: delivery moved to Thu 8 Oct",
      body: "The carrier now plans delivery in Murcia on Thu 8 Oct.",
      expectedDay: "2026-10-08",
    });
    expect(sent.ok).toBe(true);
  });

  test("there is nothing to draft for confirming a reading, nor for a step the shipment does not have", async () => {
    const { estela, marta } = await startEstela();
    expect(await estela.ops.draft(marta, "EST-4012", "confirm_reading")).toBeNull();
    expect(await estela.ops.draft(marta, "EST-4058", "notify_customer")).toBeNull();
  });
});

describe("fail closed", () => {
  test("an estimator that fails is a withheld estimate that says so: no broken screen, no invented date, no green verdict", async () => {
    const { estela, marta, mariana, camille } = await startEstela({
      ai: { estimator: { estimate: () => Promise.reject(new Error("model down")) } },
    });
    const rows = await estela.ops.shipments(marta, { view: "all" });
    expect(rows).toHaveLength(23);
    const open = rows.filter((row) => row.dates.delivered === null && row.health !== "stale");
    expect(open).toHaveLength(16);
    for (const row of open) {
      expect(row.dates.estela, row.id).toEqual({
        kind: "withheld",
        line: "No estimate: the estimator is unavailable.",
      });
    }
    // Rules that need no model still fire: the hold, the declared delay, the cut-off, the silence.
    expect(rows.filter((row) => row.case?.state === "needs_action").map((row) => row.id)).toEqual([
      "EST-4128",
      "EST-4131",
      "EST-4116",
      "EST-4012",
      "EST-4127",
    ]);

    // EST-4134 is at risk only by Estela's estimate. Without one nobody may call it on time.
    const atRisk = await estela.portal.shipment(camille, "EST-4134");
    expect(atRisk).toMatchObject({ verdict: "in_progress", verdictLabel: "On the way" });
    for (const customer of [mariana, camille]) {
      const home = await estela.portal.home(customer);
      const cards = [...home.attention, ...home.onTheWay];
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.filter((card) => card.verdict === "on_time")).toEqual([]);
    }
  });

  test("a stale shipment is not put to the estimator: the application withholds, whatever adapter is plugged in", async () => {
    // A stand-in for a learned model, which answers a day for everything it is asked.
    const asked: string[] = [];
    const { estela, marta } = await startEstela({
      ai: {
        estimator: {
          estimate: (input) => {
            asked.push(input.shipment.id);
            return Promise.resolve({
              withheld: false,
              at: dayInstant("2026-10-08"),
              precision: "day",
              window: { earliest: dayInstant("2026-10-08"), latest: dayInstant("2026-10-08") },
              steps: [],
              basis: "Learned model",
            });
          },
        },
      },
    });
    const stale = await estela.ops.shipment(marta, "EST-4127");
    expect(stale).toMatchObject({ health: "stale", case: { type: "stale" } });
    expect(stale?.dates.estela).toEqual({
      kind: "withheld",
      line: "No estimate: no position from Eisvogel Spedition for 27 h.",
    });
    expect(asked).not.toContain("EST-4127");

    // The same dates as with the stand-in that abstains by itself: the guard is not the adapter's.
    const usual = await startEstela();
    expect(stale?.dates).toEqual((await usual.estela.ops.shipment(usual.marta, "EST-4127"))?.dates);
  });

  test("without an estimate, the plan is shown as the plan for as long as it can still be met", async () => {
    const { estela, marta } = await startEstela({
      ai: { estimator: { estimate: () => Promise.reject(new Error("model down")) } },
    });
    // Picked up on plan and no operator estimate: all that is known is the booking plan.
    const view = await estela.ops.shipment(marta, "EST-4141");
    expect(view?.dates.best).toMatchObject({ day: "2026-10-08", provenance: "planned", by: null });
    expect(view?.dates.bestMissing).toBeNull();
  });

  test("the estimator is asked once per open shipment, and never about a delivered or a stale one", async () => {
    const asked: string[] = [];
    const { estela, marta } = await startEstela({
      ai: {
        estimator: {
          estimate: (input) => {
            asked.push(input.shipment.id);
            return ruleBasedEstimator.estimate(input);
          },
        },
      },
    });
    await estela.ops.shipments(marta, { view: "all" });
    await estela.ops.overview(marta);
    await estela.ops.shipment(marta, "EST-4058");
    expect(asked).toHaveLength(16);
    expect(new Set(asked).size).toBe(16);
    expect(asked).not.toContain("EST-4019");
    expect(asked).not.toContain("EST-4127");
  });

  test("a digest writer that fails leaves the computed counts and no sentence", async () => {
    const { estela, marta } = await startEstela({
      ai: { digestWriter: { highlight: () => Promise.reject(new Error("model down")) } },
    });
    expect(await estela.ops.highlight(marta)).toBeNull();
    expect((await estela.ops.overview(marta)).counts.attention).toBe(6);
  });

  test("a text interpreter that fails leaves the email as an unread note, not as a hold", async () => {
    const { estela, marta, store } = await startEstela({
      ai: { textInterpreter: { read: () => Promise.reject(new Error("model down")) } },
    });
    const view = await estela.ops.shipment(marta, "EST-4012");
    expect(view?.cases.map((item) => item.type)).not.toContain("customs_hold");
    const notes = view?.timeline.sections
      .flatMap((section) => section.entries)
      .filter((entry) => entry.type === "note" && entry.source.original?.channel === "email");
    expect(notes).toMatchObject([
      { text: "Free-text message that could not be read automatically: see the original" },
    ]);
    expect(store.unprocessed()).toEqual([]);
  });
});
