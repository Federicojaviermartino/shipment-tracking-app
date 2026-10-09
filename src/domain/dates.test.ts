import { describe, expect, test } from "vitest";
import { selectDates } from "./dates";
import type { EstelaEstimate } from "./estimate";
import type { LoggedEvent, PublishedSnapshot } from "./log";
import {
  at,
  confirmed,
  day,
  estelaEstimate,
  estimated,
  MEXICO,
  noticeSent,
  oceanShipment,
  withdrawn,
} from "./test-support";
import { buildTimeline } from "./fold";

const ocean = oceanShipment();
const T0 = at("2026-10-07 16:00");

/** At sea: sailed on plan, the line expects Veracruz on Fri 9 Oct, the forwarder the door on Wed 14 Oct. */
const sailed: LoggedEvent[] = ocean.plan
  .slice(0, 6)
  .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));
const portEta = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-09 06:00", MEXICO), {
  receivedAt: at("2026-10-05 07:00"),
});
const doorEta = estimated(ocean, "DELIVERED", day("2026-10-14"), {
  precision: "day",
  receivedAt: at("2026-10-06 08:30"),
});
const atSea = [...sailed, portEta, doorEta];

/** Demo event A: the port closes and the vessel slips two days. */
const vesselDelayed = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
  receivedAt: at("2026-10-07 16:05"),
});

const snapshot = (date: string, basis: PublishedSnapshot["basis"]): PublishedSnapshot => ({
  day: date,
  at: day(date),
  precision: "day",
  basis,
});

function dates(events: LoggedEvent[], estimate: EstelaEstimate | null, now = T0) {
  return selectDates(ocean, buildTimeline(ocean, events), estimate, events, now);
}

describe("the three dates", () => {
  test("carries the committed day, the operator's door estimate and Estela's own", () => {
    const result = dates(atSea, estelaEstimate("2026-10-14"));
    expect(result.committed).toBe("2026-10-15");
    expect(result.zone).toBe("America/Mexico_City");
    expect(result.operator).toMatchObject({
      day: "2026-10-14",
      superseded: false,
      provenance: { kind: "declared", source: "TGF", receivedAt: at("2026-10-06 08:30") },
    });
    expect(result.estelaDay).toBe("2026-10-14");
    expect(result.agreesWithOperator).toBe(true);
    expect(result.delivered).toBeNull();
  });

  test("counts the door day in local days at the destination", () => {
    const lateEvening = estimated(ocean, "DELIVERED", at("2026-10-15 23:30", MEXICO), {
      receivedAt: at("2026-10-07 09:00"),
    });
    const result = dates([...sailed, lateEvening], null);
    // 23:30 in Querétaro is already the 16th in Madrid; the promise is kept where it was made.
    expect(result.operator?.day).toBe("2026-10-15");
  });

  test("keeps a withheld estimate as withheld, with its reason", () => {
    const result = dates(atSea, { withheld: true, reason: "no position for 27 h" });
    expect(result.estela).toEqual({ withheld: true, reason: "no position for 27 h" });
    expect(result.estelaDay).toBeNull();
    expect(result.agreesWithOperator).toBe(false);
    expect(result.best).toMatchObject({ day: "2026-10-14", basis: "operator_estimate" });
  });

  test("a delivered shipment has a confirmed delivery and no estimates", () => {
    const delivered = ocean.plan.map((m) =>
      confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }),
    );
    const result = dates([...delivered, doorEta], estelaEstimate("2026-10-14"));
    expect(result.delivered).toMatchObject({
      day: "2026-10-14",
      provenance: { kind: "confirmed" },
    });
    expect(result.estela).toBeNull();
    expect(result.operator).toBeNull();
    expect(result.published).toMatchObject({ kind: "confirmed", day: "2026-10-14" });
  });
});

describe("a superseded operator estimate", () => {
  test("is superseded when an upstream change arrived after it and Estela's door day is later", () => {
    const result = dates([...atSea, vesselDelayed], estelaEstimate("2026-10-16"));
    expect(result.operator).toMatchObject({
      day: "2026-10-14",
      superseded: true,
      supersededBy: {
        code: "VESSEL_ARRIVED",
        kind: "estimate",
        source: "NRY",
        receivedAt: at("2026-10-07 16:05"),
      },
    });
    expect(result.agreesWithOperator).toBe(false);
  });

  test("is never silently preferred: the best door day becomes Estela's", () => {
    const result = dates([...atSea, vesselDelayed], estelaEstimate("2026-10-16"));
    expect(result.best).toEqual(snapshot("2026-10-16", "estela_estimate"));
  });

  test("stands when the upstream change does not move Estela's door day past it", () => {
    const result = dates([...atSea, vesselDelayed], estelaEstimate("2026-10-14"));
    expect(result.operator?.superseded).toBe(false);
  });

  test("stands when the change leaves Estela's door day before it: only a later date overrules an operator", () => {
    const result = dates([...atSea, vesselDelayed], estelaEstimate("2026-10-13"));
    expect(result.operator).toMatchObject({ day: "2026-10-14", superseded: false });
    expect(result.best).toMatchObject({ day: "2026-10-14", basis: "operator_estimate" });
  });

  test("stands when Estela disagrees but nothing upstream changed since it was declared", () => {
    const result = dates(atSea, estelaEstimate("2026-10-16"));
    expect(result.operator?.superseded).toBe(false);
    expect(result.best).toMatchObject({ day: "2026-10-14", basis: "operator_estimate" });
  });

  test("a confirmed upstream milestone received later supersedes just the same", () => {
    const berthedLate = confirmed(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:10", MEXICO));
    const result = dates([...atSea, berthedLate], estelaEstimate("2026-10-16"));
    expect(result.operator?.supersededBy).toMatchObject({
      code: "VESSEL_ARRIVED",
      kind: "confirmed",
    });
  });

  test("stops being superseded when the operator declares the door date again", () => {
    const confirmedByForwarder = estimated(ocean, "DELIVERED", day("2026-10-16"), {
      precision: "day",
      receivedAt: at("2026-10-07 17:00"),
    });
    const result = dates(
      [...atSea, vesselDelayed, confirmedByForwarder],
      estelaEstimate("2026-10-16"),
    );
    expect(result.operator).toMatchObject({ day: "2026-10-16", superseded: false });
    expect(result.agreesWithOperator).toBe(true);
    expect(result.best).toEqual(snapshot("2026-10-16", "operator_estimate"));
  });
});

describe("the published date: what the customer currently sees", () => {
  test("an operator's door estimate reaches the customer by itself", () => {
    expect(dates(atSea, estelaEstimate("2026-10-14")).published).toEqual({
      kind: "estimated",
      day: "2026-10-14",
      at: day("2026-10-14"),
      precision: "day",
      by: { kind: "carrier", source: "TGF", issuedAt: at("2026-10-06 08:30") },
    });
  });

  test("a superseded estimate is under review, carrying the date it replaced", () => {
    const result = dates([...atSea, vesselDelayed], estelaEstimate("2026-10-16"));
    expect(result.published).toEqual({
      kind: "under_review",
      was: { day: "2026-10-14", reason: "superseded" },
    });
  });

  test("an Estela estimate is published only through an approved notice", () => {
    const sent = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-16", "estela_estimate"),
    );
    const result = dates([...atSea, vesselDelayed, sent], estelaEstimate("2026-10-16"));
    expect(result.published).toEqual({
      kind: "estimated",
      day: "2026-10-16",
      at: day("2026-10-16"),
      precision: "day",
      by: {
        kind: "notice",
        noticeId: sent.id,
        approvedBy: "marta.soler",
        issuedAt: at("2026-10-07 16:20"),
      },
    });
  });

  test("the more recently issued of an operator estimate and a notice wins", () => {
    const sent = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-16", "estela_estimate"),
    );
    const later = estimated(ocean, "DELIVERED", day("2026-10-17"), {
      precision: "day",
      receivedAt: at("2026-10-07 17:00"),
    });
    const operatorLast = dates(
      [...atSea, vesselDelayed, sent, later],
      estelaEstimate("2026-10-17"),
    );
    expect(operatorLast.published).toMatchObject({ day: "2026-10-17", by: { kind: "carrier" } });

    const noticeLast = noticeSent(
      ocean,
      at("2026-10-07 18:00"),
      snapshot("2026-10-17", "operator_estimate"),
    );
    const result = dates(
      [...atSea, vesselDelayed, sent, later, noticeLast],
      estelaEstimate("2026-10-17"),
    );
    expect(result.published).toMatchObject({ day: "2026-10-17", by: { kind: "notice" } });
  });

  test("a notice that communicated no date publishes none", () => {
    const sent = noticeSent(ocean, at("2026-10-07 16:20"), null);
    const result = dates([...atSea, sent], estelaEstimate("2026-10-14"));
    expect(result.published).toMatchObject({ kind: "estimated", by: { kind: "carrier" } });
  });

  test("a withdrawn estimate is under review, carrying the date that was withdrawn", () => {
    const pending = withdrawn(ocean, "DELIVERED", at("2026-10-07 08:30"));
    const result = dates([...atSea, pending], estelaEstimate("2026-10-16"));
    expect(result.operator).toBeNull();
    expect(result.withdrawn).toMatchObject({
      day: "2026-10-14",
      withdrawnAt: at("2026-10-07 08:30"),
    });
    expect(result.published).toEqual({
      kind: "under_review",
      was: { day: "2026-10-14", reason: "withdrawn" },
    });
    expect(result.best).toEqual(snapshot("2026-10-16", "estela_estimate"));
  });

  test("with no door estimate from anybody, the booking plan is shown as a plan", () => {
    expect(dates([...sailed, portEta], estelaEstimate("2026-10-16")).published).toEqual({
      kind: "planned",
      day: "2026-10-14",
      at: day("2026-10-14"),
      precision: "day",
    });
  });

  test("a plan that has already been missed is not shown: the date is under review", () => {
    const afterThePlan = at("2026-10-15 09:00", MEXICO);
    expect(dates([...sailed, portEta], null, afterThePlan).published).toEqual({
      kind: "under_review",
    });
  });

  test("nothing to say and no estimate: there is no best door day at all", () => {
    expect(dates(sailed, null).best).toBeNull();
    expect(dates(sailed, { withheld: true, reason: "stale" }).best).toBeNull();
  });
});

describe("a door day that is over, with nothing delivered", () => {
  const lastHourOfTheDay = at("2026-10-14 23:30", MEXICO);
  const theDayAfter = at("2026-10-15 00:30", MEXICO);

  test("the operator's estimate stands through its own day at the destination", () => {
    const result = dates(atSea, estelaEstimate("2026-10-14"), lastHourOfTheDay);
    expect(result.best).toEqual(snapshot("2026-10-14", "operator_estimate"));
    expect(result.published).toMatchObject({ kind: "estimated", day: "2026-10-14" });
  });

  test("once that day is over it is still shown as declared, but it is not the best date: Estela's is", () => {
    const result = dates(atSea, estelaEstimate("2026-10-15"), theDayAfter);
    expect(result.operator).toMatchObject({ day: "2026-10-14", superseded: false });
    expect(result.best).toEqual(snapshot("2026-10-15", "estela_estimate"));
  });

  test("with no estimate to replace it, there is no best date at all", () => {
    expect(dates(atSea, null, theDayAfter).best).toBeNull();
    expect(dates(atSea, { withheld: true, reason: "stale" }, theDayAfter).best).toBeNull();
  });

  test("the customer reads a date under review, carrying the day that was missed", () => {
    expect(dates(atSea, estelaEstimate("2026-10-15"), theDayAfter).published).toEqual({
      kind: "under_review",
      was: { day: "2026-10-14", reason: "missed" },
    });
  });

  test("a date that a notice gave is under review just the same once it is over", () => {
    const sent = noticeSent(
      ocean,
      at("2026-10-07 16:20"),
      snapshot("2026-10-14", "operator_estimate"),
    );
    const result = dates([...atSea, sent], estelaEstimate("2026-10-15"), theDayAfter);
    expect(result.published).toEqual({
      kind: "under_review",
      was: { day: "2026-10-14", reason: "missed" },
    });
  });

  test("a delivery confirmed on a later day is simply the confirmed date", () => {
    const delivered = confirmed(ocean, "DELIVERED", at("2026-10-16 11:00", MEXICO));
    const result = dates([...atSea, delivered], null, at("2026-10-16 12:00", MEXICO));
    expect(result.published).toMatchObject({ kind: "confirmed", day: "2026-10-16" });
  });
});
