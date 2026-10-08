import { compareText } from "@/domain/compare";
import { defaultFileName, isCustomerVisible } from "@/domain/documents";
import { toLoggedEvent } from "@/domain/ingestion";
import type { LoggedEvent, RawMessage } from "@/domain/log";
import { IBON, type Shipment } from "@/domain/shipment";
import { isoWithOffset } from "@/domain/time";
import { MADRID } from "./calendar";
import type { SeedMessage } from "./feed";
import type { SeededShipment } from "./lanes/shared";
import { DOMESTIC_SHIPMENTS } from "./roster/domestic";
import { FULL_LOAD_SHIPMENTS, GROUPAGE_SHIPMENTS } from "./roster/eu-road";
import { OCEAN_SHIPMENTS } from "./roster/ocean";
import { VESSEL_MESSAGES } from "./sailings";

export type Seed = {
  shipments: Shipment[];
  /**
   * Everything the operators have sent up to T0, verbatim and in order of receipt. Each message
   * goes through ingestion exactly like one that arrives later.
   */
  messages: RawMessage[];
  /**
   * Our own records, which no operator adapter reads: the transport orders confirmed by the ERP
   * (with the ERP message behind each one) and the documents on file.
   */
  own: { raws: RawMessage[]; events: LoggedEvent[] };
};

const ROSTER: SeededShipment[] = [
  ...OCEAN_SHIPMENTS,
  ...DOMESTIC_SHIPMENTS,
  ...FULL_LOAD_SHIPMENTS,
  ...GROUPAGE_SHIPMENTS,
].sort((a, b) => compareText(a.shipment.id, b.shipment.id));

/** Ids follow the order of receipt per operator, so the same seed always yields the same ids. */
function numbered(messages: SeedMessage[]): RawMessage[] {
  const counters = new Map<string, number>();
  return [...messages]
    .sort(
      (a, b) =>
        a.receivedAt - b.receivedAt ||
        compareText(a.operatorId, b.operatorId) ||
        compareText(a.body, b.body),
    )
    .map((message) => {
      const count = (counters.get(message.operatorId) ?? 0) + 1;
      counters.set(message.operatorId, count);
      const id = `${message.operatorId.toLowerCase()}-${String(count).padStart(4, "0")}`;
      return { id, ...message };
    });
}

function booking({ shipment, bookedAt }: SeededShipment): { raw: RawMessage; event: LoggedEvent } {
  const raw: RawMessage = {
    id: `erp-${shipment.id}`,
    operatorId: IBON,
    channel: "api",
    receivedAt: bookedAt,
    body: JSON.stringify({
      system: "ERP",
      event: "TRANSPORT_ORDER_CONFIRMED",
      shipment: shipment.id,
      order: shipment.orderRef,
      confirmedAt: isoWithOffset(bookedAt, MADRID),
    }),
  };
  const event = toLoggedEvent({
    shipment,
    raw,
    ref: { by: "reference", value: shipment.id },
    observation: { type: "milestone", code: "BOOKED" },
    occurredAt: bookedAt,
    precision: "minute",
    reading: { method: "table", rule: "erp:transport order confirmed" },
  });
  return { raw, event };
}

function documentsOnFile({ shipment, documents }: SeededShipment): LoggedEvent[] {
  return documents.map((document) => ({
    kind: "document",
    id: `${document.source}|${shipment.id}|document:${document.docType}`,
    shipmentId: shipment.id,
    at: document.at,
    source: document.source,
    docType: document.docType,
    fileName: defaultFileName(document.docType, shipment),
    customerVisible: isCustomerVisible(document.docType),
  }));
}

const bookings = ROSTER.map(booking);

export const SHIPMENTS: Shipment[] = ROSTER.map((seeded) => seeded.shipment);

export const SEED: Seed = {
  shipments: SHIPMENTS,
  messages: numbered([...VESSEL_MESSAGES, ...ROSTER.flatMap((seeded) => seeded.messages)]),
  own: {
    raws: bookings.map(({ raw }) => raw),
    events: [...bookings.map(({ event }) => event), ...ROSTER.flatMap(documentsOnFile)],
  },
};
