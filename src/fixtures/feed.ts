import { emitCierzo, type CierzoEmission } from "@/adapters/operators/cierzo/emitter";
import { CIERZO } from "@/adapters/operators/cierzo/mapping";
import { emitEisvogel } from "@/adapters/operators/eisvogel/emitter";
import { EISVOGEL } from "@/adapters/operators/eisvogel/mapping";
import { emitNoray } from "@/adapters/operators/noray/emitter";
import { NORAY } from "@/adapters/operators/noray/mapping";
import { emitTuriaRow, type TuriaEmission } from "@/adapters/operators/turia/emitter";
import { TURIA } from "@/adapters/operators/turia/mapping";
import type { RawMessage } from "@/domain/log";
import type { MilestoneCode, Place } from "@/domain/shipment";
import {
  addDays,
  instantAt,
  localDate,
  localTime,
  MINUTE,
  nextWorkingDay,
  type Instant,
  type LocalDate,
  type Zone,
} from "@/domain/time";
import { at, day, MADRID } from "./calendar";

/**
 * The seed is authored as canonical observations and rendered to each operator's own raw format
 * by that operator's emitter, so that the application really parses raw text when it starts.
 * Ids are given when the seed is assembled, in order of receipt.
 */
export type SeedMessage = Omit<RawMessage, "id">;

/** Cierzo drops a batch file every two hours, on the even hour. */
function nextCierzoBatch(occurredAt: Instant): Instant {
  const date = localDate(occurredAt, MADRID);
  const hour = (Math.floor(Number(localTime(occurredAt, MADRID).slice(0, 2)) / 2) + 1) * 2;
  return hour === 24
    ? instantAt(addDays(date, 1), "00:00", MADRID)
    : instantAt(date, `${String(hour).padStart(2, "0")}:00`, MADRID);
}

/** Turia's status report arrives at 08:30 Madrid and covers up to the previous working day. */
function nextTuriaReport(date: LocalDate): Instant {
  return instantAt(nextWorkingDay(date), "08:30", MADRID);
}

export function cierzoFeed(expedicion: string) {
  const message = (emission: Omit<CierzoEmission, "expedicion">): SeedMessage => ({
    operatorId: CIERZO,
    channel: "csv",
    receivedAt: nextCierzoBatch(emission.occurredAt),
    body: emitCierzo({ expedicion, ...emission }),
  });
  return {
    milestone: (code: MilestoneCode, place: Place, when: string, remark?: string) =>
      message({
        observation: { type: "milestone", code, place },
        occurredAt: at(when, MADRID),
        ...(remark ? { remark } : {}),
      }),
    /** An incident whose remark maps to nothing: kept verbatim as a note. */
    incident: (plaza: Place, when: string, remark: string) =>
      message({
        observation: { type: "note", text: remark },
        occurredAt: at(when, MADRID),
        plaza,
      }),
    hold: (plaza: Place, when: string, remark: string, reason: string) =>
      message({
        observation: { type: "hold", hold: "carrier", state: "raised", reason },
        occurredAt: at(when, MADRID),
        plaza,
        remark,
      }),
    newDeliveryDate: (plaza: Place, when: string, date: LocalDate) =>
      message({
        observation: { type: "estimate", code: "DELIVERED", at: day(date), precision: "day" },
        occurredAt: at(when, MADRID),
        plaza,
      }),
  };
}

export type Waypoint = { name: string; country: Place["country"]; lat: number; lon: number };

export function eisvogelFeed(sendungsnr: string, eta: { at: Instant; zone: Zone }) {
  const received = (occurredAt: Instant) => occurredAt + MINUTE;
  return {
    milestone: (code: MilestoneCode, place: Place, when: string, withEta = false): SeedMessage => {
      const occurredAt = at(when, place.zone);
      return {
        operatorId: EISVOGEL,
        channel: "webhook",
        receivedAt: received(occurredAt),
        body: emitEisvogel({
          sendungsnr,
          observation: { type: "milestone", code, place },
          occurredAt,
          ...(withEta ? { eta } : {}),
        }),
      };
    },
    /** A telematics ping: every one carries the truck's coordinates and the delivery ETA. */
    position: (waypoint: Waypoint, occurredAt: Instant, zone: Zone): SeedMessage => ({
      operatorId: EISVOGEL,
      channel: "webhook",
      receivedAt: received(occurredAt),
      body: emitEisvogel({
        sendungsnr,
        observation: { type: "position", place: `${waypoint.name}, ${waypoint.country}` },
        occurredAt,
        zone,
        coordinates: { lat: waypoint.lat, lon: waypoint.lon },
        eta,
      }),
    }),
  };
}

/** Noray's API is polled: an event reaches us some minutes after it happens. */
const NORAY_POLL_LAG = 10 * MINUTE;

export function norayFeed(container: string) {
  return {
    equipment: (code: MilestoneCode, port: Place, when: string): SeedMessage => {
      const occurredAt = at(when, port.zone);
      return {
        operatorId: NORAY,
        channel: "api",
        receivedAt: occurredAt + NORAY_POLL_LAG,
        body: emitNoray({
          observation: { type: "milestone", code, place: port },
          occurredAt,
          container,
        }),
      };
    },
  };
}

export function norayVoyageFeed(voyage: { vessel: string; voyage: string }) {
  const actual = (code: MilestoneCode, port: Place, when: string): SeedMessage => {
    const occurredAt = at(when, port.zone);
    return {
      operatorId: NORAY,
      channel: "api",
      receivedAt: occurredAt + NORAY_POLL_LAG,
      body: emitNoray({
        observation: { type: "milestone", code, place: port },
        occurredAt,
        voyage,
      }),
    };
  };
  return {
    departed: (port: Place, when: string) => actual("VESSEL_DEPARTED", port, when),
    arrived: (port: Place, when: string) => actual("VESSEL_ARRIVED", port, when),
    /** The line's estimate of the arrival, as received at a Madrid wall-clock time. */
    arrivalEstimate: (port: Place, when: string, received: string): SeedMessage => ({
      operatorId: NORAY,
      channel: "api",
      receivedAt: at(received, MADRID),
      body: emitNoray({
        observation: {
          type: "estimate",
          code: "VESSEL_ARRIVED",
          place: port,
          at: at(when, port.zone),
          precision: "minute",
        },
        voyage,
      }),
    }),
  };
}

export function turiaFeed(expediente: string, refCliente: string) {
  const row = (
    emission: Omit<TuriaEmission, "expediente" | "refCliente">,
    receivedAt: Instant,
  ): SeedMessage => ({
    operatorId: TURIA,
    channel: "report",
    receivedAt,
    body: emitTuriaRow({ expediente, refCliente, ...emission }),
  });
  return {
    /** A milestone of a given day, in the report of the next working morning. */
    milestone: (code: MilestoneCode, date: LocalDate, observaciones?: string) =>
      row(
        {
          observation: { type: "milestone", code },
          occurredAt: day(date),
          ...(observaciones ? { observaciones } : {}),
        },
        nextTuriaReport(date),
      ),
    billOfLading: (date: LocalDate) =>
      row(
        { observation: { type: "document", docType: "bill_of_lading" }, occurredAt: day(date) },
        nextTuriaReport(date),
      ),
    /** The door ETA, in the report received at a Madrid wall-clock time. */
    doorEstimate: (date: LocalDate, received: string, observaciones?: string) =>
      row(
        {
          observation: { type: "estimate", code: "DELIVERED", at: day(date), precision: "day" },
          ...(observaciones ? { observaciones } : {}),
        },
        at(received, MADRID),
      ),
    doorEstimateWithdrawn: (received: string, observaciones: string) =>
      row(
        { observation: { type: "estimate_withdrawn", code: "DELIVERED" }, observaciones },
        at(received, MADRID),
      ),
    /** Free text: no emitter can write it, so an email is authored verbatim. */
    email: (received: string, body: string): SeedMessage => ({
      operatorId: TURIA,
      channel: "email",
      receivedAt: at(received, MADRID),
      body,
    }),
  };
}
