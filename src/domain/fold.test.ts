import { describe, expect, test } from "vitest";
import { buildTimeline } from "./fold";
import type { LoggedEvent, OperatorEvent } from "./log";
import { milestoneKey } from "./shipment";
import {
  AI_READING,
  at,
  confirmed,
  day,
  estimated,
  hold,
  MEXICO,
  noticeSent,
  oceanShipment,
  PERPIGNAN,
  position,
  remark,
  reviewed,
  roadShipment,
  shuffled,
  VALENCIA,
  withdrawn,
  ZARAGOZA,
} from "./test-support";
import { HOUR } from "./time";
import {
  allEntries,
  findMilestone,
  holdsOf,
  milestonesOf,
  type Estimated,
  type MilestoneEntry,
  type Stamp,
  type Timeline,
} from "./timeline";

const ocean = oceanShipment();

/** Order 12345 as it stands at sea: three operators, one timeline. */
const atSea: OperatorEvent[] = [
  confirmed(ocean, "BOOKED", at("2026-09-16 10:12")),
  confirmed(ocean, "PICKED_UP", at("2026-09-21 15:10")),
  confirmed(ocean, "GATE_IN", at("2026-09-22 08:25"), { source: "CRZ" }),
  confirmed(ocean, "GATE_IN", at("2026-09-22 08:31"), { source: "NRY" }),
  confirmed(ocean, "EXPORT_RELEASED", day("2026-09-23"), {
    precision: "day",
    receivedAt: at("2026-09-24 08:30"),
  }),
  confirmed(ocean, "LOADED", at("2026-09-25 03:10")),
  confirmed(ocean, "VESSEL_DEPARTED", at("2026-09-25 21:40")),
  estimated(ocean, "VESSEL_ARRIVED", at("2026-10-09 06:00", MEXICO), {
    receivedAt: at("2026-10-05 07:00"),
  }),
  estimated(ocean, "DELIVERED", day("2026-10-14"), {
    precision: "day",
    receivedAt: at("2026-10-06 08:30"),
  }),
];

function milestone(timeline: Timeline, code: MilestoneEntry["code"]): MilestoneEntry {
  const entry = findMilestone(timeline, code);
  if (!entry) throw new Error(`No ${code} in the timeline`);
  return entry;
}

describe("the fold is a function of the set of events", () => {
  const expected = buildTimeline(ocean, atSea);

  test("yields the same timeline for any arrival order", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      expect(buildTimeline(ocean, shuffled(atSea, seed))).toEqual(expected);
    }
  });

  test("yields the same timeline when messages are redelivered", () => {
    const redelivered = atSea.map((event) => ({
      ...event,
      rawId: `${event.rawId}:again`,
      receivedAt: event.receivedAt + HOUR,
    }));
    for (let seed = 1; seed <= 10; seed += 1) {
      const log = shuffled([...atSea, ...redelivered, ...atSea], seed);
      expect(buildTimeline(ocean, log)).toEqual(expected);
    }
  });

  test("ignores events of other shipments", () => {
    const other = oceanShipment({ id: "EST-9" });
    const foreign = confirmed(other, "VESSEL_ARRIVED", at("2026-10-09 05:40", MEXICO));
    expect(buildTimeline(ocean, [...atSea, foreign])).toEqual(expected);
  });

  test("lays the milestones out in plan order under their sections, the booking above them", () => {
    expect(expected.lead.map((entry) => entry.type === "milestone" && entry.code)).toEqual([
      "BOOKED",
    ]);
    expect(expected.sections.map(({ section }) => section.id)).toEqual([
      "pre",
      "origin",
      "sea",
      "destination",
      "door",
    ]);
    expect(milestonesOf(expected).map((entry) => entry.code)).toEqual(
      ocean.plan.map((planned) => planned.code),
    );
  });

  test("marks what is done, what comes next and what is still ahead", () => {
    const states = Object.fromEntries(
      milestonesOf(expected).map((entry) => [entry.code, entry.state]),
    );
    expect(states).toMatchObject({
      BOOKED: "done",
      VESSEL_DEPARTED: "done",
      VESSEL_ARRIVED: "next",
      DISCHARGED: "upcoming",
      DELIVERED: "upcoming",
    });
  });
});

describe("two sources and corrections", () => {
  const timeline = buildTimeline(ocean, atSea);

  test("merges one physical event reported by two sources into one milestone", () => {
    const gateIn = milestonesOf(timeline).filter((entry) => entry.code === "GATE_IN");
    expect(gateIn).toHaveLength(1);
    expect(gateIn[0]?.sources.map((source) => source.source)).toEqual(["NRY", "CRZ"]);
  });

  test("shows the time of the first reporter in authority order, whoever spoke first", () => {
    const gateIn = milestone(timeline, "GATE_IN");
    expect(gateIn.actual?.at).toBe(at("2026-09-22 08:31"));
    expect(gateIn.actual?.provenance).toMatchObject({ kind: "confirmed", source: "NRY" });
  });

  test("falls back to the second reporter while the first one is silent", () => {
    const hauilerOnly = atSea.filter(
      (event) =>
        !(
          event.source === "NRY" &&
          event.fact.type === "milestone" &&
          event.fact.code === "GATE_IN"
        ),
    );
    const gateIn = milestone(buildTimeline(ocean, hauilerOnly), "GATE_IN");
    expect(gateIn.actual?.at).toBe(at("2026-09-22 08:25"));
    expect(gateIn.sources).toHaveLength(1);
  });

  test("a later report from the same source corrects the time", () => {
    const first = confirmed(ocean, "LOADED", at("2026-09-25 03:10"));
    const correction = confirmed(ocean, "LOADED", at("2026-09-25 04:45"), {
      receivedAt: at("2026-09-25 09:00"),
    });
    for (const log of [
      [first, correction],
      [correction, first],
    ]) {
      const loaded = milestone(buildTimeline(ocean, log), "LOADED");
      expect(loaded.actual?.at).toBe(at("2026-09-25 04:45"));
      expect(loaded.sources).toHaveLength(1);
    }
  });
});

describe("authority and gaps", () => {
  test("a source outside the reporters cannot confirm a milestone: it stays a note", () => {
    const rumour = confirmed(ocean, "VESSEL_ARRIVED", at("2026-10-09 05:00", MEXICO), {
      source: "TGF",
    });
    const timeline = buildTimeline(ocean, [...atSea, rumour]);
    expect(milestone(timeline, "VESSEL_ARRIVED").actual).toBeUndefined();
    expect(milestone(timeline, "VESSEL_ARRIVED").state).toBe("next");
    expect(allEntries(timeline)).toContainEqual(
      expect.objectContaining({ type: "note", source: "TGF", status: "unauthorised" }),
    );
  });

  test("a source outside the reporters cannot declare an estimate either", () => {
    const guess = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-12 06:00", MEXICO), {
      source: "CRZ",
      receivedAt: at("2026-10-06 10:00"),
    });
    const arrival = milestone(buildTimeline(ocean, [...atSea, guess]), "VESSEL_ARRIVED");
    expect(arrival.operatorEstimate?.at).toBe(at("2026-10-09 06:00", MEXICO));
  });

  test("marks a skipped milestone as not reported and never back-fills it", () => {
    const skipped = atSea.filter(
      (event) => !(event.fact.type === "milestone" && event.fact.code === "LOADED"),
    );
    const loaded = milestone(buildTimeline(ocean, skipped), "LOADED");
    expect(loaded.state).toBe("not_reported");
    expect(loaded.actual).toBeUndefined();
    expect(loaded.sources).toEqual([]);
  });

  test("a late old event fills the gap it belongs to", () => {
    const skipped = atSea.filter(
      (event) => !(event.fact.type === "milestone" && event.fact.code === "LOADED"),
    );
    const late = confirmed(ocean, "LOADED", at("2026-09-25 03:10"), {
      receivedAt: at("2026-10-01 09:00"),
    });
    const loaded = milestone(buildTimeline(ocean, [...skipped, late]), "LOADED");
    expect(loaded.state).toBe("done");
    expect(loaded.actual?.at).toBe(at("2026-09-25 03:10"));
  });
});

describe("unplanned milestones, signals and our own actions", () => {
  const road = roadShipment();
  const pickedUp = confirmed(road, "PICKED_UP", at("2026-10-05 15:05"));

  test("inserts an unplanned hub scan in its section in time order and flags it", () => {
    const breakdown = remark(road, "AVERÍA VEHÍCULO TRACTOR", at("2026-10-06 02:50"), {
      source: "EVS",
    });
    const backAtBase = confirmed(road, "HUB_IN", at("2026-10-06 11:30"), { place: ZARAGOZA });
    const timeline = buildTimeline(road, [backAtBase, breakdown, pickedUp]);
    const entries = timeline.sections[0]?.entries ?? [];

    expect(entries.slice(0, 3).map((entry) => entry.type)).toEqual([
      "milestone",
      "note",
      "milestone",
    ]);
    expect(entries[2]).toMatchObject({
      key: milestoneKey("HUB_IN", ZARAGOZA),
      state: "done",
      unplanned: true,
    });
    expect(entries[3]).toMatchObject({ key: milestoneKey("HUB_IN", VALENCIA), state: "next" });
  });

  test("an unplanned stop reported by two sources is one entry, timed by whoever said it first", () => {
    const network = confirmed(road, "HUB_IN", at("2026-10-06 11:30"), { place: ZARAGOZA });
    const haulier = confirmed(road, "HUB_IN", at("2026-10-06 11:42"), {
      place: ZARAGOZA,
      source: "CRZ",
    });
    for (const log of [
      [pickedUp, network, haulier],
      [haulier, network, pickedUp],
    ]) {
      const stops = milestonesOf(buildTimeline(road, log)).filter((entry) => entry.unplanned);
      expect(stops).toHaveLength(1);
      expect(stops[0]?.sources.map((source) => source.source)).toEqual(["EVS", "CRZ"]);
      expect(stops[0]?.actual?.at).toBe(at("2026-10-06 11:30"));
    }
  });

  test("a hub scan belongs to the hub it names", () => {
    const transit = confirmed(road, "HUB_IN", at("2026-10-06 06:10"), { place: PERPIGNAN });
    const timeline = buildTimeline(road, [pickedUp, transit]);
    const hubs = milestonesOf(timeline).filter((entry) => entry.code === "HUB_IN");
    expect(hubs.map((entry) => [entry.place.name, entry.state])).toEqual([
      ["Valencia", "not_reported"],
      ["Perpignan", "done"],
    ]);
  });

  test("collapses positions into one entry with the last place and a count", () => {
    const pings = ["Castelló", "Tarragona", "Girona"].map((where, index) =>
      position(road, where, at("2026-10-05 16:00") + index * HOUR),
    );
    const entries = allEntries(buildTimeline(road, [pickedUp, ...shuffled(pings, 3)]));
    expect(entries.filter((entry) => entry.type === "position")).toEqual([
      expect.objectContaining({ lastPlace: "Girona", count: 3, at: at("2026-10-05 18:00") }),
    ]);
  });

  test("puts a signal between the milestones it happened between, not at the end of the section", () => {
    const inPort = [
      ...atSea,
      confirmed(ocean, "VESSEL_ARRIVED", at("2026-10-09 05:40", MEXICO)),
      confirmed(ocean, "DISCHARGED", at("2026-10-10 09:15", MEXICO)),
      confirmed(ocean, "IMPORT_LODGED", day("2026-10-12"), {
        precision: "day",
        receivedAt: at("2026-10-13 08:30"),
      }),
    ];
    const waiting = remark(ocean, "Awaiting broker instructions", at("2026-10-11 10:00", MEXICO), {
      source: "TGF",
    });
    const held = hold(ocean, "customs", "raised", at("2026-10-12 17:55"));
    const port = buildTimeline(ocean, [held, waiting, ...inPort]).sections.find(
      ({ section }) => section.id === "destination",
    );
    expect(
      port?.entries.map((entry) => (entry.type === "milestone" ? entry.code : entry.type)),
    ).toEqual(["DISCHARGED", "note", "IMPORT_LODGED", "hold", "IMPORT_RELEASED", "GATE_OUT"]);
  });

  test("a customs gate does not say where the cargo is: a signal at sea stays at sea", () => {
    const prelodged = confirmed(ocean, "IMPORT_LODGED", day("2026-10-07"), {
      precision: "day",
      receivedAt: at("2026-10-07 08:30"),
    });
    const weather = remark(ocean, "Heavy weather, speed reduced", at("2026-10-08 10:00"), {
      source: "NRY",
    });
    const timeline = buildTimeline(ocean, [...atSea, prelodged, weather]);
    const sectionOf = (type: string) =>
      timeline.sections.find(({ entries }) => entries.some((entry) => entry.type === type))?.section
        .id;
    expect(sectionOf("note")).toBe("sea");
  });

  test("shows what we did ourselves, where the cargo was at the time", () => {
    const sent = noticeSent(road, at("2026-10-07 16:10"), null);
    const timeline = buildTimeline(road, [pickedUp, sent]);
    expect(timeline.sections[0]?.entries[1]).toMatchObject({
      type: "action",
      action: "notice_sent",
      by: "marta.soler",
    });
  });

  test("a record of ours that was appended twice shows once", () => {
    const sent = noticeSent(road, at("2026-10-07 16:10"), null);
    const actions = allEntries(buildTimeline(road, [pickedUp, sent, sent])).filter(
      (entry) => entry.type === "action",
    );
    expect(actions).toHaveLength(1);
  });

  test("remembers when each source was last heard from, and when the last fact landed", () => {
    const ping = position(road, "Girona", at("2026-10-06 13:00"));
    const timeline = buildTimeline(road, [pickedUp, ping]);
    expect(timeline.signals).toEqual([
      expect.objectContaining({ source: "EVS", lastOccurredAt: at("2026-10-06 13:00") }),
    ]);
    expect(timeline.lastFactReceivedAt).toBe(ping.receivedAt);
  });
});

describe("operator estimates", () => {
  test("keeps the latest declared estimate and drops it once the milestone is confirmed", () => {
    const revised = estimated(ocean, "VESSEL_ARRIVED", at("2026-10-11 08:00", MEXICO), {
      receivedAt: at("2026-10-07 16:05"),
      remark: "WEA: port closed",
    });
    const arrival = milestone(buildTimeline(ocean, [revised, ...atSea]), "VESSEL_ARRIVED");
    expect(arrival.operatorEstimate).toMatchObject({
      at: at("2026-10-11 08:00", MEXICO),
      remark: "WEA: port closed",
      provenance: { kind: "declared", source: "NRY", receivedAt: at("2026-10-07 16:05") },
    });

    const berthed = confirmed(ocean, "VESSEL_ARRIVED", at("2026-10-11 07:40", MEXICO));
    const done = milestone(buildTimeline(ocean, [...atSea, revised, berthed]), "VESSEL_ARRIVED");
    expect(done.operatorEstimate).toBeUndefined();
    expect(done.actual?.at).toBe(at("2026-10-11 07:40", MEXICO));
  });

  test("a withdrawn estimate is no longer current, and is remembered as withdrawn", () => {
    const pending = withdrawn(ocean, "DELIVERED", at("2026-10-07 08:30"), {
      remark: "Pendiente de aduana",
    });
    const delivery = milestone(buildTimeline(ocean, [...atSea, pending]), "DELIVERED");
    expect(delivery.operatorEstimate).toBeUndefined();
    expect(delivery.withdrawnEstimate).toMatchObject({
      at: day("2026-10-14"),
      withdrawnAt: at("2026-10-07 08:30"),
      reason: "Pendiente de aduana",
    });
  });

  test("an estimate declared after a withdrawal stands again", () => {
    const pending = withdrawn(ocean, "DELIVERED", at("2026-10-07 08:30"));
    const again = estimated(ocean, "DELIVERED", day("2026-10-16"), {
      precision: "day",
      receivedAt: at("2026-10-08 08:30"),
    });
    const delivery = milestone(buildTimeline(ocean, [again, pending, ...atSea]), "DELIVERED");
    expect(delivery.operatorEstimate?.at).toBe(day("2026-10-16"));
    expect(delivery.withdrawnEstimate).toBeUndefined();
  });
});

describe("holds", () => {
  const raised = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), {
    remark: "Weight discrepancy between invoice and bill of lading",
  });

  test("a hold is open from the moment it is raised until it is cleared", () => {
    const open = holdsOf(buildTimeline(ocean, [...atSea, raised]));
    expect(open).toEqual([
      expect.objectContaining({
        hold: "customs",
        open: true,
        reading: "table",
        reason: "Weight discrepancy between invoice and bill of lading",
      }),
    ]);

    const cleared = hold(ocean, "customs", "cleared", at("2026-10-13 16:20"));
    for (const log of [
      [...atSea, raised, cleared],
      [cleared, raised, ...atSea],
    ]) {
      expect(holdsOf(buildTimeline(ocean, log))).toEqual([
        expect.objectContaining({ open: false, clearedAt: at("2026-10-13 16:20") }),
      ]);
    }
  });

  test("a release with no hold standing changes nothing", () => {
    const cleared = hold(ocean, "customs", "cleared", at("2026-10-13 16:20"));
    expect(holdsOf(buildTimeline(ocean, [...atSea, cleared]))).toEqual([]);
  });
});

describe("AI readings are gated", () => {
  const read = hold(ocean, "customs", "raised", at("2026-10-12 17:55"), { reading: AI_READING });

  test("a reading is pending until somebody reviews it", () => {
    const [entry] = holdsOf(buildTimeline(ocean, [...atSea, read]));
    expect(entry).toMatchObject({ open: true, reading: "ai_pending", eventKey: read.key });
  });

  test("an accepted reading is a fact", () => {
    const log: LoggedEvent[] = [...atSea, read, reviewed(read, true, at("2026-10-12 18:10"))];
    expect(holdsOf(buildTimeline(ocean, log))).toEqual([
      expect.objectContaining({ open: true, reading: "ai_accepted" }),
    ]);
  });

  test("a rejected reading is ignored by every rule and kept as a note", () => {
    const log: LoggedEvent[] = [...atSea, read, reviewed(read, false, at("2026-10-12 18:10"))];
    const timeline = buildTimeline(ocean, log);
    expect(holdsOf(timeline)).toEqual([]);
    expect(allEntries(timeline)).toContainEqual(
      expect.objectContaining({ type: "note", status: "ai_rejected", eventKey: read.key }),
    );
  });

  test("the latest review decides", () => {
    const log: LoggedEvent[] = [
      reviewed(read, true, at("2026-10-12 18:30")),
      ...atSea,
      read,
      reviewed(read, false, at("2026-10-12 18:10")),
    ];
    expect(holdsOf(buildTimeline(ocean, log))[0]).toMatchObject({ reading: "ai_accepted" });
  });

  test("a milestone read by a model is not done until it is accepted", () => {
    const arrival = confirmed(ocean, "VESSEL_ARRIVED", at("2026-10-09 05:40", MEXICO), {
      reading: AI_READING,
    });
    const pending = milestone(buildTimeline(ocean, [...atSea, arrival]), "VESSEL_ARRIVED");
    expect(pending).toMatchObject({ state: "next", reading: "ai_pending" });
    expect(pending.actual).toBeUndefined();
    expect(pending.pendingReading?.eventKey).toBe(arrival.key);

    const accepted = milestone(
      buildTimeline(ocean, [...atSea, arrival, reviewed(arrival, true, at("2026-10-09 15:00"))]),
      "VESSEL_ARRIVED",
    );
    expect(accepted).toMatchObject({ state: "done", reading: "ai_accepted" });
  });

  test("an unreviewed reading does not count as the last fact received", () => {
    const before = buildTimeline(ocean, atSea).lastFactReceivedAt;
    expect(buildTimeline(ocean, [...atSea, read]).lastFactReceivedAt).toBe(before);
  });
});

describe("provenance is part of the type", () => {
  test("a model estimate cannot occupy the slot of a fact", () => {
    const predicted: Stamp<Estimated> = {
      at: day("2026-10-16"),
      precision: "day",
      provenance: { kind: "estimated", basis: "Rule-based estimate", computedAt: 0 },
    };
    const entry = milestone(buildTimeline(ocean, atSea), "DELIVERED");
    // @ts-expect-error -- `actual` accepts only what an operator confirmed
    entry.actual = predicted;
    expect(entry.actual).toBe(predicted);
  });
});
