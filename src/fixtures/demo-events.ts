import { EISVOGEL } from "@/adapters/operators/eisvogel/mapping";
import { NORAY } from "@/adapters/operators/noray/mapping";
import { TURIA, TURIA_HEADER } from "@/adapters/operators/turia/mapping";
import type { Channel, RawMessage } from "@/domain/log";
import type { DocumentType, OperatorId, ShipmentId } from "@/domain/shipment";
import { isoWithOffset, type Instant, type Zone } from "@/domain/time";
import { PARIS } from "./calendar";

export type DemoEventId = "A" | "B" | "C" | "D";

/** What must already be in the log for an event to make sense. Evaluated against the log. */
export type DemoPrecondition =
  | { kind: "none" }
  | { kind: "demo_event_sent"; id: DemoEventId }
  | { kind: "document_sent"; shipmentId: ShipmentId; docType: DocumentType };

/**
 * One step of the scripted live feed. There is no timer: the demo bar sends them one at a time,
 * and each label names what it sends. Bodies are raw operator payloads; `NOW_TOKEN` stands for
 * the moment of sending.
 */
export type DemoEvent = {
  id: DemoEventId;
  label: string;
  operatorId: OperatorId;
  channel: Channel;
  precondition: DemoPrecondition;
  bodies: string[];
};

const NOW_TOKEN = "<now>";

/** The one payload that carries the token comes from a truck in France. */
const NOW_ZONE: Zone = PARIS;

const turiaRow = (row: string) => `${TURIA_HEADER}\n${row}`;

export const DEMO_EVENTS: DemoEvent[] = [
  {
    id: "A",
    label: "Noray Lines · NORAY ALTAIR delayed at Veracruz",
    operatorId: NORAY,
    channel: "api",
    precondition: { kind: "none" },
    bodies: [
      JSON.stringify({
        eventType: "TRANSPORT",
        transportEventTypeCode: "ARRI",
        eventClassifierCode: "EST",
        eventDateTime: "2026-10-11T08:00:00-06:00",
        UNLocationCode: "MXVER",
        vesselName: "NORAY ALTAIR",
        carrierVoyageNumber: "612W",
        delayReasonCode: "WEA",
        changeRemark:
          "Port closed to navigation by harbour master: norther, gusts 45 kn. Berth window lost.",
      }),
    ],
  },
  {
    id: "B",
    label: "Turia Global Forwarding · confirms the new delivery date",
    operatorId: TURIA,
    channel: "report",
    precondition: { kind: "demo_event_sent", id: "A" },
    bodies: [
      turiaRow(
        "TGF-26-03412;12345;ENTREGA;ETA;16/10/2026;Atraque NORAY ALTAIR previsto 11/10 por cierre del puerto",
      ),
      turiaRow(
        "TGF-26-03418;48221;ENTREGA;ETA;16/10/2026;Atraque NORAY ALTAIR previsto 11/10 por cierre del puerto",
      ),
    ],
  },
  {
    id: "C",
    label: "Turia Global Forwarding · customs release, EST-4012",
    operatorId: TURIA,
    channel: "report",
    precondition: { kind: "document_sent", shipmentId: "EST-4012", docType: "commercial_invoice" },
    bodies: [
      turiaRow(
        "TGF-26-03290;48176;DESPACHO IMPORTACION;DESADUANADO;07/10/2026;Factura rectificada aceptada",
      ),
      turiaRow("TGF-26-03290;48176;ENTREGA;ETA;09/10/2026;"),
    ],
  },
  {
    id: "D",
    label: "Eisvogel Spedition · position signal back, EST-4127",
    operatorId: EISVOGEL,
    channel: "webhook",
    precondition: { kind: "none" },
    bodies: [
      JSON.stringify({
        sendungsnr: "EVS-88104588",
        status: "510",
        statustext: "Unterwegs",
        ort: "Besançon, FR",
        zeit: NOW_TOKEN,
        eta: "2026-10-08T11:00:00+02:00",
        bemerkung: "Telematik-Störung behoben",
      }),
    ],
  },
];

/** The id of the n-th message of a demo event: stable, so "sent" can be read from the log. */
export function demoMessageId(id: DemoEventId, index: number): string {
  return `demo-${id}-${index + 1}`;
}

/** The raw messages of a demo event as they are sent at `now`. */
export function demoMessages(event: DemoEvent, now: Instant): RawMessage[] {
  return event.bodies.map((body, index) => ({
    id: demoMessageId(event.id, index),
    operatorId: event.operatorId,
    channel: event.channel,
    receivedAt: now,
    body: body.replaceAll(NOW_TOKEN, isoWithOffset(now, NOW_ZONE)),
  }));
}
