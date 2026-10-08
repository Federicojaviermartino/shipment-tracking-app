import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import type { Verdict } from "@/domain/customer-view";
import type { Health } from "@/domain/exceptions";
import type { ExceptionType } from "@/domain/log";
import type { Stage } from "@/domain/stage";
import { DAY, HOUR } from "@/domain/time";
import { T0 } from "@/fixtures";
import type { OpsShipmentView, PublishedView } from "./views";

/**
 * The golden roster. Nothing below is authored in the seed: the seed holds the plans, the raw
 * operator messages and the documents, and every value asserted here is derived from them by the
 * whole core, from raw text to view. The expectations are the roster of the world specification
 * at T0 (Wednesday 7 October 2026, 16:00 in Madrid), written out shipment by shipment.
 */

type Expected = {
  stage: Stage;
  health: Health;
  /** The primary exception, or `null` when nothing is open. */
  exception: ExceptionType | null;
  /** The door day the operator currently declares. */
  operator: string | null;
  /** Estela's door day; `withheld` when it declines; `null` once delivered. */
  estela: string | null;
  verdict: Verdict;
  /** What the customer currently sees as the delivery date. */
  published: string;
};

const ROSTER: Record<string, Expected> = {
  // Ocean, Valencia to Veracruz.
  "EST-4012": {
    stage: "at_destination_port",
    health: "held",
    exception: "customs_hold",
    operator: null,
    estela: "2026-10-09",
    verdict: "in_progress",
    published: "under review, was 2026-10-07",
  },
  "EST-4019": {
    stage: "delivered",
    health: "delivered",
    exception: null,
    operator: null,
    estela: null,
    verdict: "delivered",
    published: "confirmed 2026-10-01",
  },
  "EST-4033": {
    stage: "at_destination_port",
    health: "on_time",
    exception: null,
    operator: "2026-10-09",
    estela: "2026-10-09",
    verdict: "on_time",
    published: "estimated 2026-10-09 by the carrier",
  },
  "EST-4036": {
    stage: "final_leg",
    health: "on_time",
    exception: null,
    operator: "2026-10-07",
    estela: "2026-10-07",
    verdict: "on_time",
    published: "estimated 2026-10-07 by the carrier",
  },
  "EST-4058": {
    stage: "at_sea",
    health: "on_time",
    exception: null,
    operator: "2026-10-14",
    estela: "2026-10-14",
    verdict: "on_time",
    published: "estimated 2026-10-14 by the carrier",
  },
  "EST-4063": {
    stage: "at_sea",
    health: "on_time",
    exception: null,
    operator: "2026-10-14",
    estela: "2026-10-14",
    verdict: "on_time",
    published: "estimated 2026-10-14 by the carrier",
  },
  "EST-4116": {
    stage: "at_origin_port",
    health: "at_risk",
    exception: "cutoff_risk",
    operator: "2026-10-28",
    estela: "2026-10-28",
    verdict: "in_progress",
    published: "estimated 2026-10-28 by the carrier",
  },
  "EST-4122": {
    stage: "in_transit",
    health: "on_time",
    exception: null,
    operator: null,
    estela: "2026-10-28",
    verdict: "on_time",
    published: "planned 2026-10-28",
  },
  // Domestic road.
  "EST-4120": {
    stage: "delivered",
    health: "delivered",
    exception: null,
    operator: null,
    estela: null,
    verdict: "delivered",
    published: "confirmed 2026-10-06",
  },
  "EST-4128": {
    stage: "in_transit",
    health: "delayed",
    exception: "delay",
    operator: "2026-10-08",
    estela: "2026-10-08",
    verdict: "delayed",
    published: "estimated 2026-10-08 by the carrier",
  },
  "EST-4131": {
    stage: "in_transit",
    health: "held",
    exception: "carrier_hold",
    operator: null,
    estela: "2026-10-08",
    verdict: "on_hold",
    published: "planned 2026-10-07",
  },
  "EST-4133": {
    stage: "delivered",
    health: "delivered",
    exception: null,
    operator: null,
    estela: null,
    verdict: "delivered",
    published: "confirmed 2026-10-07",
  },
  "EST-4141": {
    stage: "in_transit",
    health: "on_time",
    exception: null,
    operator: null,
    estela: "2026-10-08",
    verdict: "on_time",
    published: "planned 2026-10-08",
  },
  "EST-4147": {
    stage: "booked",
    health: "on_time",
    exception: null,
    operator: null,
    estela: "2026-10-13",
    verdict: "on_time",
    published: "planned 2026-10-13",
  },
  // EU road, full loads.
  "EST-4107": {
    stage: "delivered",
    health: "delivered",
    exception: null,
    operator: null,
    estela: null,
    verdict: "delivered",
    published: "confirmed 2026-10-05",
  },
  "EST-4111": {
    stage: "delivered",
    health: "delivered",
    exception: null,
    operator: null,
    estela: null,
    verdict: "delivered",
    published: "confirmed 2026-10-06",
  },
  "EST-4115": {
    stage: "delivered",
    health: "delivered",
    exception: null,
    operator: null,
    estela: null,
    verdict: "delivered",
    published: "confirmed 2026-10-06",
  },
  "EST-4127": {
    stage: "in_transit",
    health: "stale",
    exception: "stale",
    operator: "2026-10-08",
    estela: "withheld",
    verdict: "in_progress",
    published: "estimated 2026-10-08 by the carrier",
  },
  "EST-4140": {
    stage: "in_transit",
    health: "on_time",
    exception: null,
    operator: "2026-10-08",
    estela: "2026-10-08",
    verdict: "on_time",
    published: "estimated 2026-10-08 by the carrier",
  },
  // EU road, groupage.
  "EST-4134": {
    stage: "in_transit",
    health: "at_risk",
    exception: "predicted_delay",
    operator: "2026-10-08",
    estela: "2026-10-09",
    verdict: "in_progress",
    published: "estimated 2026-10-08 by the carrier",
  },
  "EST-4136": {
    stage: "in_transit",
    health: "on_time",
    exception: null,
    operator: "2026-10-09",
    estela: "2026-10-09",
    verdict: "on_time",
    published: "estimated 2026-10-09 by the carrier",
  },
  "EST-4143": {
    stage: "out_for_delivery",
    health: "on_time",
    exception: null,
    operator: "2026-10-07",
    estela: "2026-10-07",
    verdict: "on_time",
    published: "estimated 2026-10-07 by the carrier",
  },
  "EST-4149": {
    stage: "booked",
    health: "on_time",
    exception: null,
    operator: null,
    estela: "2026-10-12",
    verdict: "on_time",
    published: "planned 2026-10-12",
  },
};

function publishedOf(published: PublishedView): string {
  switch (published.kind) {
    case "confirmed":
    case "planned":
      return `${published.kind} ${published.day}`;
    case "estimated":
      return `estimated ${published.day} by ${published.by === "carrier" ? "the carrier" : `a notice approved by ${published.approvedBy}`}`;
    case "under_review":
      return published.was ? `under review, was ${published.was}` : "under review";
  }
}

function derived(view: OpsShipmentView): Expected {
  const { estela } = view.dates;
  return {
    stage: view.stage.code,
    health: view.health,
    exception: view.case?.type ?? null,
    operator: view.dates.operator?.day ?? null,
    estela: estela === null ? null : estela.kind === "withheld" ? "withheld" : estela.day,
    verdict: view.customerSees.verdict,
    published: publishedOf(view.customerSees.published),
  };
}

describe("the golden roster at T0", () => {
  test("lists exactly the 23 shipments of the world", async () => {
    const { estela, marta } = await startEstela();
    const rows = await estela.ops.shipments(marta, { view: "all" });
    expect(rows.map((row) => row.id).sort()).toEqual(Object.keys(ROSTER).sort());
  });

  test.each(Object.entries(ROSTER))(
    "%s: stage, health, exception, the three dates and what the customer sees",
    async (id, expected) => {
      const { estela, marta } = await startEstela();
      const view = await estela.ops.shipment(marta, id);
      if (!view) throw new Error(`${id} is missing`);
      expect(derived(view)).toEqual(expected);
    },
  );

  test("totals: 1 delayed, 2 held, 2 at risk, 1 stale, 11 on time, 6 delivered", async () => {
    const { estela, marta } = await startEstela();
    const rows = await estela.ops.shipments(marta, { view: "all" });
    const totals = rows.reduce<Record<string, number>>(
      (count, row) => ({ ...count, [row.health]: (count[row.health] ?? 0) + 1 }),
      {},
    );
    expect(totals).toEqual({
      delayed: 1,
      held: 2,
      at_risk: 2,
      stale: 1,
      on_time: 11,
      delivered: 6,
    });
  });

  test("the portal shows each customer the same verdict and date that operations are told it sees", async () => {
    const { estela, marta, mariana, camille } = await startEstela();
    for (const customer of [mariana, camille]) {
      const home = await estela.portal.home(customer);
      const cards = [...home.attention, ...home.onTheWay, ...home.delivered];
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const ops = await estela.ops.shipment(marta, card.id);
        expect({ verdict: card.verdict, published: card.published }, card.id).toEqual({
          verdict: ops?.customerSees.verdict,
          published: ops?.customerSees.published,
        });
      }
    }
  });
});

describe("what the roster says beyond the columns", () => {
  test("EST-4012 is held at the import gate on an AI reading nobody has confirmed, its door estimate withdrawn", async () => {
    const { estela, marta } = await startEstela();
    const view = await estela.ops.shipment(marta, "EST-4012");
    expect(view?.stage.importGate).toBe("held");
    expect(view?.case).toMatchObject({ needsConfirmation: true, basis: "declared" });
    expect(view?.case?.reading).toMatchObject({
      state: "ai_pending",
      text: "Customs hold: Customs found a gross-weight discrepancy between the commercial invoice (4,180 kg) and the bill of lading (4,810 kg); a corrected invoice is required.",
      source: "Turia Global Forwarding",
    });
    expect(view?.case?.reading?.original?.body).toContain("discrepancia de peso bruto");
    expect(view?.dates.withdrawn).toMatchObject({
      day: "2026-10-07",
      by: "Turia Global Forwarding",
    });
  });

  test("EST-4012's Estela estimate is conditional: Fri 9 Oct, window to Mon 12 Oct, if the corrected invoice reaches the broker today", async () => {
    const { estela, marta } = await startEstela();
    const view = await estela.ops.shipment(marta, "EST-4012");
    expect(view?.dates.estela).toMatchObject({
      kind: "estimate",
      day: "2026-10-09",
      window: { earliest: "2026-10-09", latest: "2026-10-12" },
      assumption: "Assumes: if the corrected invoice reaches the broker today.",
      basis: "Rule-based estimate",
    });
  });

  test("EST-4127's estimate is withheld, with the reason in words", async () => {
    const { estela, marta } = await startEstela();
    const view = await estela.ops.shipment(marta, "EST-4127");
    expect(view?.dates.estela).toEqual({
      kind: "withheld",
      line: "No estimate: no position from Eisvogel Spedition for 27 h.",
    });
    expect(view?.dates.best).toMatchObject({ day: "2026-10-08", provenance: "declared" });
  });

  test("EST-4134 is predicted late by inference: the operator still says Thu 8 Oct, Estela Fri 9 Oct", async () => {
    const { estela, marta } = await startEstela();
    const view = await estela.ops.shipment(marta, "EST-4134");
    expect(view?.case).toMatchObject({ type: "predicted_delay", basis: "inferred" });
    expect(view?.dates.operator).toMatchObject({ day: "2026-10-08", superseded: false });
    expect(view?.dates.estela).toMatchObject({ day: "2026-10-09", agreesWithOperator: false });
    expect(view?.case?.why).toBe(
      "In the Perpignan hub since Tue 6 Oct 06:10; the departure scan planned for Tue 6 Oct 20:00 never came. Eisvogel Spedition still says Thu 8 Oct; Estela estimates Fri 9 Oct.",
    );
  });

  test("EST-4033 is at the destination port with its import entry lodged, EST-4036 on the final leg", async () => {
    const { estela, marta } = await startEstela();
    expect((await estela.ops.shipment(marta, "EST-4033"))?.stage.importGate).toBe("lodged");
    expect((await estela.ops.shipment(marta, "EST-4036"))?.stage).toMatchObject({
      code: "final_leg",
      importGate: "released",
    });
  });

  test("every shipment that is on time has an Estela estimate on the day the operator or the plan says", async () => {
    const { estela, marta } = await startEstela();
    const rows = await estela.ops.shipments(marta, { view: "all" });
    const onTime = rows.filter((row) => row.health === "on_time");
    expect(onTime).toHaveLength(11);
    for (const row of onTime) {
      const { estela: estimate, operator, best } = row.dates;
      expect(estimate?.kind, row.id).toBe("estimate");
      if (estimate?.kind !== "estimate") continue;
      expect(estimate.day, row.id).toBe(operator?.day ?? best?.day);
      expect(estimate.lateBy, row.id).toBeLessThanOrEqual(0);
    }
  });

  test("EST-4116 has no commercial invoice on file; proof of delivery is pending for EST-4111 and EST-4133", async () => {
    const { estela, marta } = await startEstela();
    const open = async (id: string) =>
      (await estela.ops.shipment(marta, id))?.documents
        .filter((document) => document.status === "missing" || document.status === "pending")
        .map((document) => `${document.docType}: ${document.status}`);
    expect(await open("EST-4116")).toEqual(["commercial_invoice: missing"]);
    expect(await open("EST-4111")).toEqual(["proof_of_delivery: pending"]);
    expect(await open("EST-4133")).toEqual(["proof_of_delivery: pending"]);
    expect(await open("EST-4058")).toEqual([]);
  });
});

describe("the queue at T0", () => {
  test("Marta's attention list, in order, each with its clock and its steps", async () => {
    const { estela, marta } = await startEstela();
    const queue = await estela.ops.shipments(marta, { view: "attention" });
    expect(
      queue.map((row) => [
        row.id,
        row.healthLabel,
        row.case?.clock?.label ?? null,
        row.case?.clock?.detail ?? null,
        row.case?.steps.map((step) => step.kind).join(" > "),
      ]),
    ).toEqual([
      ["EST-4128", "Delayed", "Now", "Customer not yet told", "notify_customer"],
      [
        "EST-4134",
        "At risk",
        "Act within 4 h",
        "Next linehaul leaves the Perpignan hub, Wed 7 Oct 20:00",
        "contact_operator > notify_customer",
      ],
      [
        "EST-4131",
        "Held",
        "Act within 15 h",
        "Tomorrow's first delivery round leaves the Málaga platform, Thu 8 Oct 07:00",
        "contact_operator > notify_customer",
      ],
      [
        "EST-4116",
        "At risk",
        "Cut-off in 20 h",
        "Export clearance cut-off for NORAY DENEB 614W, Thu 8 Oct 12:00",
        "send_document",
      ],
      [
        "EST-4012",
        "Held",
        "Free time ends Fri 9 Oct",
        "Free time ends: demurrage starts, Fri 9 Oct 23:59",
        "confirm_reading > send_document > notify_customer",
      ],
      ["EST-4127", "Stale", null, null, "contact_operator"],
    ]);
  });

  test("a case that needs action never says the reader's part is done", async () => {
    const { estela, marta } = await startEstela();
    const queue = await estela.ops.shipments(marta, { view: "attention" });
    expect(queue.map((row) => row.case?.waiting)).toEqual([null, null, null, null, null, null]);
    expect(queue.every((row) => row.case?.nextStep?.state === "todo")).toBe(true);
  });

  test("once a deadline has passed, the clock says so and the briefing stops promising it can be met", async () => {
    // Wed 7 Oct 21:00: the 20:00 linehaul from Perpignan has left.
    const { estela, marta } = await startEstela({ at: T0 + 5 * HOUR });
    const view = await estela.ops.shipment(marta, "EST-4134");
    expect(view?.case?.clock).toMatchObject({ kind: "next_departure", label: "Departure missed" });
    const highlight = await estela.ops.highlight(marta);
    expect(highlight?.shipmentIds).toEqual(["EST-4116"]);
    expect(highlight?.caption).toBe("Written by AI from the nearest deadline");
    expect(highlight?.text).not.toContain("EST-4134");
  });

  test("nothing is waiting at T0, and the three views add up", async () => {
    const { estela, marta } = await startEstela();
    expect(await estela.ops.shipments(marta, { view: "waiting" })).toEqual([]);
    expect(await estela.ops.shipments(marta, { view: "all" })).toHaveLength(23);
    expect((await estela.ops.overview(marta)).counts).toEqual({
      attention: 6,
      waiting: 0,
      all: 23,
      delayed: 1,
      held: 2,
      atRisk: 2,
      stale: 1,
      onPlan: 11,
      deliveredSinceYesterday: 4,
    });
  });

  test("the briefing counts by rule and says so in one line", async () => {
    const { estela, marta } = await startEstela();
    expect((await estela.ops.overview(marta)).line).toBe(
      "6 need you: 1 delayed, 2 held, 2 at risk, 1 stale. 11 on plan. 4 delivered since yesterday.",
    );
  });

  test("the generated sentence names the two at-risk cases with the nearest deadlines", async () => {
    const { estela, marta } = await startEstela();
    const highlight = await estela.ops.highlight(marta);
    expect(highlight?.shipmentIds).toEqual(["EST-4134", "EST-4116"]);
    expect(highlight?.text).toContain("EST-4134");
    expect(highlight?.text).toContain("EST-4116");
    expect(highlight?.caption).toBe("Written by AI from the 2 nearest deadlines");
  });

  test("the five personas, each with its side and its perimeter in words", async () => {
    const { estela } = await startEstela();
    expect(estela.actors().map((actor) => actor.name)).toEqual([
      "Marta Soler",
      "Iker Zabala",
      "Lucía Ferrer",
      "Mariana Olvera",
      "Camille Roussel",
    ]);
    expect(estela.demo.personas().map((persona) => [persona.side, persona.perimeter])).toEqual([
      ["operations", "All sites, all accounts · 23 shipments"],
      ["operations", "Abadiño plant · 5 shipments"],
      ["operations", "Aquabajío Ingeniería and Vauclair Hydraulique, any site · 13 shipments"],
      ["customer", "Aquabajío Ingeniería · 8 shipments"],
      ["customer", "Vauclair Hydraulique · 5 shipments"],
    ]);
  });

  test("Iker, at the Abadiño plant, sees 5 shipments and one case", async () => {
    const { estela, iker } = await startEstela();
    expect(await estela.ops.shipments(iker, { view: "all" })).toHaveLength(5);
    const queue = await estela.ops.shipments(iker, { view: "attention" });
    expect(queue.map((row) => row.id)).toEqual(["EST-4012"]);
    expect(await estela.ops.highlight(iker)).toBeNull();
  });

  test("Lucía, in customer support, sees 13 shipments and three cases, and may only notify", async () => {
    const { estela, lucia } = await startEstela();
    expect(await estela.ops.shipments(lucia, { view: "all" })).toHaveLength(13);
    const queue = await estela.ops.shipments(lucia, { view: "attention" });
    expect(queue.map((row) => row.id)).toEqual(["EST-4134", "EST-4116", "EST-4012"]);

    const steps = queue.flatMap((row) => row.case?.steps ?? []);
    const others = steps.filter((step) => step.kind !== "notify_customer");
    expect(others.length).toBeGreaterThan(0);
    for (const step of others) {
      expect(step).toMatchObject({
        allowed: false,
        disabledReason: "Needs the Logistics role. Ask Marta Soler.",
      });
    }
    const notify = queue[0]?.case?.steps.find((step) => step.kind === "notify_customer");
    expect(notify).toMatchObject({ allowed: true, disabledReason: null });
  });

  test("a delivered shipment leaves the customer's home page after thirty days", async () => {
    const now = await startEstela();
    const delivered = async (world: typeof now) =>
      (await world.estela.portal.home(world.mariana)).delivered.map((card) => card.id);
    expect(await delivered(now)).toEqual(["EST-4019"]);
    // EST-4019 was delivered on Thu 1 Oct.
    expect(await delivered(await startEstela({ at: T0 + 24 * DAY }))).toEqual(["EST-4019"]);
    expect(await delivered(await startEstela({ at: T0 + 25 * DAY }))).toEqual([]);
  });

  test("the incoterm line says who clears import, wherever there is a border to clear", async () => {
    const { estela, marta, mariana, camille } = await startEstela();
    const ops = async (id: string) => (await estela.ops.shipment(marta, id))?.incotermLine;
    expect(await ops("EST-4058")).toBe("DAP Querétaro: the consignee clears import");
    expect(await ops("EST-4128")).toBe("DAP Murcia");
    expect(await ops("EST-4134")).toBe("CPT Saint-Priest");
    expect((await estela.portal.shipment(mariana, "EST-4058"))?.incotermLine).toBe(
      "DAP Querétaro: you clear import",
    );
    expect((await estela.portal.shipment(camille, "EST-4134"))?.incotermLine).toBe(
      "CPT Saint-Priest",
    );
  });

  test("the customers see 8 and 5 shipments, and nothing that needs their attention yet", async () => {
    const { estela, mariana, camille } = await startEstela();
    const count = async (customer: typeof mariana) => {
      const home = await estela.portal.home(customer);
      return {
        shipments: home.attention.length + home.onTheWay.length + home.delivered.length,
        summary: home.summary,
      };
    };
    expect(await count(mariana)).toEqual({ shipments: 8, summary: "7 shipments on the way." });
    expect(await count(camille)).toEqual({ shipments: 5, summary: "4 shipments on the way." });
  });
});
