import { describe, expect, test } from "vitest";
import type { LoggedEvent } from "./log";
import type { MilestoneCode } from "./shipment";
import { importGateOf, stageOf, type Stage } from "./stage";
import {
  AI_READING,
  at,
  confirmed,
  day,
  hold,
  oceanShipment,
  reviewed,
  roadShipment,
} from "./test-support";
import { buildTimeline } from "./fold";

const ocean = oceanShipment();

/** The ocean journey in plan order, each milestone at its planned time. */
function upTo(last: MilestoneCode): LoggedEvent[] {
  const end = ocean.plan.findIndex((milestone) => milestone.code === last);
  return ocean.plan
    .slice(0, end + 1)
    .map((milestone) =>
      confirmed(ocean, milestone.code, milestone.plannedAt, { precision: milestone.precision }),
    );
}

const stageAfter = (events: LoggedEvent[]) => stageOf(buildTimeline(ocean, events));

describe("stage: where the cargo physically is", () => {
  test.each<[MilestoneCode | null, Stage]>([
    [null, "booked"],
    ["BOOKED", "booked"],
    ["PICKED_UP", "in_transit"],
    ["GATE_IN", "at_origin_port"],
    ["EXPORT_RELEASED", "at_origin_port"],
    ["LOADED", "at_origin_port"],
    ["VESSEL_DEPARTED", "at_sea"],
    ["VESSEL_ARRIVED", "at_destination_port"],
    ["DISCHARGED", "at_destination_port"],
    ["IMPORT_LODGED", "at_destination_port"],
    ["IMPORT_RELEASED", "at_destination_port"],
    ["GATE_OUT", "final_leg"],
    ["DELIVERED", "delivered"],
  ])("with everything up to %s confirmed, the stage is %s", (last, stage) => {
    expect(stageAfter(last ? upTo(last) : [])).toBe(stage);
  });

  test("road scans keep a shipment in transit until it is out for delivery", () => {
    const road = roadShipment();
    const stage = (codes: MilestoneCode[]) =>
      stageOf(
        buildTimeline(
          road,
          road.plan
            .filter((milestone) => codes.includes(milestone.code))
            .map((milestone) =>
              confirmed(road, milestone.code, milestone.plannedAt, { place: milestone.place }),
            ),
        ),
      );
    expect(stage(["PICKED_UP", "HUB_IN", "HUB_OUT"])).toBe("in_transit");
    expect(stage(["PICKED_UP", "HUB_IN", "HUB_OUT", "OUT_FOR_DELIVERY"])).toBe("out_for_delivery");
  });

  test("an import entry lodged before arrival leaves the shipment at sea", () => {
    const prelodged = confirmed(ocean, "IMPORT_LODGED", day("2026-10-07"), { precision: "day" });
    expect(stageAfter([...upTo("VESSEL_DEPARTED"), prelodged])).toBe("at_sea");
  });

  test("an export release never moves the stage, even when it is the only thing reported", () => {
    const released = confirmed(ocean, "EXPORT_RELEASED", day("2026-09-23"), { precision: "day" });
    expect(stageAfter([released])).toBe("booked");
  });

  test("a late old event cannot move the stage backwards", () => {
    const journey = upTo("GATE_OUT").filter(
      (event) =>
        !(
          event.kind === "operator" &&
          event.fact.type === "milestone" &&
          event.fact.code === "LOADED"
        ),
    );
    const lateLoaded = confirmed(ocean, "LOADED", at("2026-09-25 03:10"), {
      receivedAt: at("2026-10-14 09:00"),
    });
    expect(stageAfter(journey)).toBe("final_leg");
    expect(stageAfter([...journey, lateLoaded])).toBe("final_leg");
  });

  test("the gate-out landing before the report of the release is still the final leg", () => {
    const withoutRelease = upTo("GATE_OUT").filter(
      (event) =>
        !(
          event.kind === "operator" &&
          event.fact.type === "milestone" &&
          event.fact.code === "IMPORT_RELEASED"
        ),
    );
    expect(stageAfter(withoutRelease)).toBe("final_leg");
  });
});

describe("the import gate has its own state", () => {
  const gate = (events: LoggedEvent[], factsOnly = false) =>
    importGateOf(buildTimeline(ocean, events), { factsOnly })?.state;

  test("goes from not lodged to lodged to released", () => {
    expect(gate(upTo("DISCHARGED"))).toBe("not_lodged");
    expect(gate(upTo("IMPORT_LODGED"))).toBe("lodged");
    expect(gate(upTo("IMPORT_RELEASED"))).toBe("released");
  });

  test("is held while a customs hold stands", () => {
    const raised = hold(ocean, "customs", "raised", at("2026-10-12 17:55"));
    const cleared = hold(ocean, "customs", "cleared", at("2026-10-13 16:00"));
    expect(gate([...upTo("IMPORT_LODGED"), raised])).toBe("held");
    expect(gate([...upTo("IMPORT_LODGED"), raised, cleared])).toBe("lodged");
  });

  test("an unconfirmed reading holds the gate for operations only", () => {
    const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });
    const log = [...upTo("IMPORT_LODGED"), read];
    expect(gate(log)).toBe("held");
    expect(gate(log, true)).toBe("lodged");
    expect(gate([...log, reviewed(read, true, at("2026-10-12 18:10"))], true)).toBe("held");
  });

  test("a customs hold before the vessel sails is not about the import gate", () => {
    const exportSide = hold(ocean, "customs", "raised", at("2026-09-23 10:00"));
    expect(gate([...upTo("GATE_IN"), exportSide])).toBe("not_lodged");
  });

  test("a road shipment has no import gate", () => {
    expect(importGateOf(buildTimeline(roadShipment(), []))).toBeNull();
  });
});
