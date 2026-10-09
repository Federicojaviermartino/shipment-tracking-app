import { defaultFileName } from "@/domain/documents";
import type { ShipmentException } from "@/domain/exceptions";
import { DESK_ZONE } from "@/domain/filters";
import { DOCUMENT_LABEL, HOLD_LABEL, MILESTONE_LABEL } from "@/domain/labels";
import { internalEvents, type LoggedEvent } from "@/domain/log";
import type { Step } from "@/domain/playbook";
import type { ShipmentProjection } from "@/domain/projection";
import { deadlineZone, originPlace, type DocumentType } from "@/domain/shipment";
import { nextExpectation } from "@/domain/staleness";
import { formatDay, HOUR, isPast, localDate, type LocalDate } from "@/domain/time";
import {
  allEntries,
  deliveryOf,
  findMilestone,
  milestonesOf,
  openHolds,
  physicalProgress,
} from "@/domain/timeline";
import type { ReadContext } from "./context";
import { sourceName } from "./directory";
import type { DraftFacts, Moment } from "./ports/message-drafter";
import { reportNoun, stamp } from "./text/format";
import type { FactLine } from "./views";

/**
 * The fact sheet of a draft: everything a message about a case may say, collected by rules from
 * the shipment record. It exists twice, from the same data: typed, for the drafter to write
 * from, and as lines with their provenance and dates, for the person who reviews the draft.
 */

export type FactSheetLine = Omit<FactLine, "used">;

function dayOf(moment: Moment): LocalDate {
  return localDate(moment.at, moment.zone);
}

/** A corrected document is a new revision of the one that was rejected. */
function suggestedFileName(
  projection: ShipmentProjection,
  docType: DocumentType,
  corrected: boolean,
) {
  const name = defaultFileName(docType, projection.shipment);
  return corrected ? name.replace(/\.pdf$/, "-rev2.pdf") : name;
}

export function collectFacts(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
  step: Step,
  events: readonly LoggedEvent[],
): { facts: DraftFacts; heldReading: "table" | "ai" | null } {
  const { shipment, timeline, dates } = projection;
  const { now, directory } = context;
  const { zone } = dates;
  const name = (source: string) => sourceName(directory, source);
  const { last, next } = physicalProgress(timeline);
  const estela = dates.estela && !dates.estela.withheld ? dates.estela : null;
  const planned = deliveryOf(timeline)?.planned;

  // The day of a customs release the estimate assumes. The plan says what each step is.
  const assumedRelease =
    shipment.plan.flatMap((milestone) => {
      if (milestone.code !== "EXPORT_RELEASED" && milestone.code !== "IMPORT_RELEASED") return [];
      const assumed = estela?.steps.find(
        (candidate) => candidate.from === "assumption" && candidate.milestoneKey === milestone.key,
      );
      return assumed ? [localDate(assumed.at, milestone.place.zone)] : [];
    })[0] ?? null;

  // The earliest milestone still ahead that an operator has pushed back: the cause upstream.
  const pushed = milestonesOf(timeline).find(
    (entry) =>
      entry.code !== "DELIVERED" &&
      !entry.actual &&
      entry.operatorEstimate !== undefined &&
      entry.planned !== undefined &&
      localDate(entry.operatorEstimate.at, entry.place.zone) >
        localDate(entry.planned.at, entry.place.zone),
  );

  const wanted = exception.type === "carrier_hold" ? "carrier" : "customs";
  const holds = openHolds(timeline);
  const held = holds.find((hold) => hold.hold === wanted) ?? holds[0];

  const expected = next?.operatorEstimate ?? next?.planned;
  const overdue =
    last?.actual &&
    next &&
    expected &&
    isPast(expected.at, expected.precision, now, next.place.zone)
      ? {
          last: {
            milestone: last.code,
            place: last.place.name,
            at: { at: last.actual.at, precision: last.actual.precision, zone: last.place.zone },
          },
          expected: {
            milestone: next.code,
            place: next.place.name,
            at: { at: expected.at, precision: expected.precision, zone: next.place.zone },
          },
        }
      : null;

  const expectation = nextExpectation(timeline);
  const silent =
    expectation && now > expectation.by && expectation.reason.kind === "telematics_silence"
      ? expectation.reason
      : null;
  const position = allEntries(timeline)
    .flatMap((entry) => (entry.type === "position" ? [entry] : []))
    .sort((a, b) => a.at - b.at)
    .at(-1);

  const clock = exception.actBy?.deadline;
  const protectedMilestone = shipment.plan.find((m) => m.key === clock?.milestoneKey);

  const documentStep =
    step.kind === "send_document"
      ? step
      : exception.steps.find((candidate) => candidate.kind === "send_document");
  const docType = documentStep?.docType;
  const sent = docType
    ? internalEvents(events)
        .filter((event) => event.type === "document_sent" && event.docType === docType)
        .sort((a, b) => a.at - b.at)
        .at(-1)
    : undefined;
  const corrected = docType !== undefined && held?.requires === docType;

  const gateIn = findMilestone(timeline, "GATE_IN");
  const origin = originPlace(shipment)?.zone ?? DESK_ZONE;

  const facts: DraftFacts = {
    today: localDate(now, zone),
    committed: dates.committed,
    planned: planned ? localDate(planned.at, zone) : null,
    operatorDoor: dates.operator
      ? {
          day: dates.operator.day,
          by: name(dates.operator.provenance.source),
          superseded: dates.operator.superseded,
        }
      : null,
    estelaDoor:
      estela && dates.estelaDay
        ? {
            day: dates.estelaDay,
            assumption: estela.assumption ?? null,
            assumedRelease,
          }
        : null,
    published:
      step.kind === "notify_customer" && dates.best
        ? { day: dates.best.day, basis: dates.best.basis }
        : null,
    upstream:
      pushed?.operatorEstimate && pushed.planned
        ? {
            milestone: pushed.code,
            place: pushed.place.name,
            now: {
              at: pushed.operatorEstimate.at,
              precision: pushed.operatorEstimate.precision,
              zone: pushed.place.zone,
            },
            was: {
              at: pushed.planned.at,
              precision: pushed.planned.precision,
              zone: pushed.place.zone,
            },
            by: name(pushed.operatorEstimate.provenance.source),
            remark: pushed.operatorEstimate.remark ?? null,
          }
        : null,
    hold: held
      ? {
          kind: held.hold,
          reason: held.reason,
          by: name(held.raised.provenance.source),
          place: last?.place.name ?? null,
          since: {
            at: held.raised.at,
            precision: held.raised.precision,
            // A hold read from a message is dated by its receipt, on the desk's clock.
            zone: held.reading === "table" ? (last?.place.zone ?? origin) : DESK_ZONE,
          },
        }
      : null,
    overdue,
    silence: silent
      ? {
          hours: Math.floor((now - silent.lastSignalAt) / HOUR),
          lastPlace: position?.lastPlace ?? null,
          since: { at: silent.lastSignalAt, precision: "minute", zone: origin },
          by: name(silent.source),
        }
      : null,
    deadline: clock
      ? {
          kind: clock.kind,
          label: clock.label,
          at: {
            at: clock.at,
            precision: "minute",
            zone: deadlineZone(shipment, clock),
          },
          consequence: clock.consequence ?? null,
          milestone: protectedMilestone
            ? { code: protectedMilestone.code, place: protectedMilestone.place.name }
            : null,
        }
      : null,
    document: docType
      ? {
          docType,
          fileName: suggestedFileName(projection, docType, corrected),
          corrected,
          sentOn: sent ? localDate(sent.at, zone) : null,
        }
      : null,
    operatorContacted: exception.steps.some(
      (candidate) => candidate.kind === "contact_operator" && candidate.state === "done",
    ),
    remarks: allEntries(timeline)
      .flatMap((entry) => (entry.type === "note" && !entry.status ? [entry] : []))
      .sort((a, b) => b.at - a.at)
      .slice(0, 3)
      .map((note) => ({
        text: note.text,
        at: { at: note.at, precision: "minute", zone: origin },
        by: name(note.source),
      })),
    gateIn: gateIn?.actual
      ? {
          place: gateIn.place.name,
          at: { at: gateIn.actual.at, precision: gateIn.actual.precision, zone: gateIn.place.zone },
        }
      : null,
  };
  const heldReading = held ? (held.reading === "table" ? "table" : "ai") : null;
  return { facts, heldReading };
}

/** The sheet as the reader sees it: one line per fact, with where it comes from and its dates. */
export function factLines(facts: DraftFacts, heldReading: "table" | "ai" | null): FactSheetLine[] {
  const lines: FactSheetLine[] = [
    {
      id: "committed",
      label: "Committed date",
      value: formatDay(facts.committed),
      provenance: "committed",
      source: null,
      dates: [facts.committed],
    },
  ];
  const add = (line: FactSheetLine) => lines.push(line);

  if (facts.published) {
    add({
      id: "published",
      label: "Date this notice gives the customer",
      value: formatDay(facts.published.day),
      provenance: facts.published.basis === "operator_estimate" ? "declared" : "estimated",
      source:
        facts.published.basis === "operator_estimate" ? (facts.operatorDoor?.by ?? null) : null,
      dates: [facts.published.day],
    });
  }
  if (facts.operatorDoor) {
    add({
      id: "operatorDoor",
      label: "Operator estimate",
      value: `${formatDay(facts.operatorDoor.day)}${facts.operatorDoor.superseded ? ", declared before the latest change" : ""}`,
      provenance: "declared",
      source: facts.operatorDoor.by,
      dates: [facts.operatorDoor.day],
    });
  }
  if (facts.estelaDoor) {
    const { day, assumption, assumedRelease } = facts.estelaDoor;
    add({
      id: "estelaDoor",
      label: "Estela estimate",
      value: `${formatDay(day)}${assumption ? `, ${assumption}` : ""}`,
      provenance: "estimated",
      source: null,
      dates: assumedRelease ? [day, assumedRelease] : [day],
    });
  }
  if (facts.planned) {
    add({
      id: "planned",
      label: "Planned delivery",
      value: formatDay(facts.planned),
      provenance: "planned",
      source: null,
      dates: [facts.planned],
    });
  }
  if (facts.upstream) {
    const { milestone, place, now, was, by, remark } = facts.upstream;
    add({
      id: "upstream",
      label: `${MILESTONE_LABEL[milestone]}, ${place}`,
      value: `${stamp(now)}${was ? `, was ${stamp(was)}` : ""}${remark ? `. Operator's remark: "${remark}"` : ""}`,
      provenance: "declared",
      source: by,
      dates: was ? [dayOf(now), dayOf(was)] : [dayOf(now)],
    });
  }
  if (facts.hold) {
    add({
      id: "hold",
      label: HOLD_LABEL[facts.hold.kind].ops,
      value: `${facts.hold.reason} Reported ${stamp(facts.hold.since)}.`,
      provenance: heldReading === "ai" ? "ai_reading" : "declared",
      source: facts.hold.by,
      dates: [dayOf(facts.hold.since)],
    });
  }
  if (facts.overdue) {
    const { last, expected } = facts.overdue;
    add({
      id: "overdue",
      label: "Last report",
      value: `${MILESTONE_LABEL[last.milestone]} at ${last.place}, ${stamp(last.at)}; ${reportNoun(expected.milestone)} planned for ${stamp(expected.at)} not received`,
      provenance: "confirmed",
      source: null,
      dates: [dayOf(last.at), dayOf(expected.at)],
    });
  }
  if (facts.silence) {
    add({
      id: "silence",
      label: "Last position",
      value: `${facts.silence.lastPlace ?? "Unknown"}, ${stamp(facts.silence.since)}, ${facts.silence.hours} h ago`,
      provenance: "confirmed",
      source: facts.silence.by,
      dates: [dayOf(facts.silence.since)],
    });
  }
  if (facts.deadline) {
    add({
      id: "deadline",
      label: facts.deadline.label,
      value: `${stamp(facts.deadline.at)}${facts.deadline.consequence ? `. ${facts.deadline.consequence}` : ""}`,
      provenance: "record",
      source: null,
      dates: [dayOf(facts.deadline.at)],
    });
  }
  if (facts.document) {
    const { docType, fileName, sentOn } = facts.document;
    add({
      id: "document",
      label: DOCUMENT_LABEL[docType],
      value: `${fileName}${sentOn ? `, sent ${formatDay(sentOn)}` : ", not sent yet"}`,
      provenance: "record",
      source: null,
      dates: sentOn ? [sentOn] : [],
    });
  }
  if (facts.operatorContacted) {
    add({
      id: "operatorContacted",
      label: "Operator already asked",
      value: "Yes",
      provenance: "record",
      source: null,
      dates: [],
    });
  }
  if (facts.remarks.length > 0) {
    add({
      id: "remarks",
      label: "Operator's remarks",
      value: facts.remarks.map((remark) => `"${remark.text}" (${stamp(remark.at)})`).join("; "),
      provenance: "declared",
      source: facts.remarks[0]?.by ?? null,
      dates: [...new Set(facts.remarks.map((remark) => dayOf(remark.at)))],
    });
  }
  if (facts.gateIn) {
    add({
      id: "gateIn",
      label: "Gate-in",
      value: `${facts.gateIn.place}, ${stamp(facts.gateIn.at)}`,
      provenance: "confirmed",
      source: null,
      dates: [dayOf(facts.gateIn.at)],
    });
  }
  add({
    id: "today",
    label: "Today",
    value: formatDay(facts.today),
    provenance: "record",
    source: null,
    dates: [facts.today],
  });
  return lines;
}
