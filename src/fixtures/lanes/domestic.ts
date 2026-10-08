import { CIERZO } from "@/adapters/operators/cierzo/mapping";
import { IBON, type Deadline, type Place, type Shipment } from "@/domain/shipment";
import type { LocalDate } from "@/domain/time";
import { at, MADRID } from "../calendar";
import type { Consignee } from "../directory";
import { cierzoFeed, type SeedMessage } from "../feed";
import { planned, present, siteOf, type SeedDocument, type SeededShipment } from "./shared";

type DomesticTimes = { pickedUp: string; hubIn: string; outForDelivery: string; delivered: string };

/**
 * Domestic distribution with Transportes Cierzo: collected at the site, trunked overnight to the
 * destination platform and delivered on its round. Scans only, no telematics. Every time is
 * Madrid wall-clock.
 */
export type DomesticRow = {
  id: string;
  orderRef: string;
  siteId: string;
  consignee: Consignee;
  committed: LocalDate;
  cargo: Shipment["cargo"];
  expedicion: string;
  /** The Cierzo platform that delivers to the consignee. */
  platform: Place;
  plan: DomesticTimes & { booked: string };
  actual: Partial<DomesticTimes> & {
    booked: string;
    /** The carrier's remark on the delivery row. */
    deliveryRemark?: string;
    /** Anything the lane cannot express, written by hand. */
    also?: (cierzo: ReturnType<typeof cierzoFeed>) => SeedMessage[];
  };
  deadlines?: Deadline[];
  /** When the signed delivery note came back. */
  proofOfDelivery?: string;
};

export function domesticShipment(row: DomesticRow): SeededShipment {
  const site = siteOf(row.siteId);
  const destination = row.consignee.place;
  const reporters = [CIERZO];

  const shipment: Shipment = {
    id: row.id,
    orderRef: row.orderRef,
    accountId: row.consignee.accountId,
    originSiteId: site.id,
    consignee: { name: row.consignee.name, place: destination },
    incoterm: { code: "DAP", place: destination.name },
    cargo: row.cargo,
    committedDate: row.committed,
    sections: [
      {
        id: "road",
        kind: "road",
        operatorId: CIERZO,
        from: site.place,
        to: destination,
        telematics: false,
      },
    ],
    plan: [
      planned("BOOKED", null, site.place, at(row.plan.booked, MADRID), "minute", [IBON]),
      planned("PICKED_UP", "road", site.place, at(row.plan.pickedUp, MADRID), "minute", reporters),
      planned("HUB_IN", "road", row.platform, at(row.plan.hubIn, MADRID), "minute", reporters),
      planned(
        "OUT_FOR_DELIVERY",
        "road",
        row.platform,
        at(row.plan.outForDelivery, MADRID),
        "minute",
        reporters,
      ),
      planned(
        "DELIVERED",
        "road",
        destination,
        at(row.plan.delivered, MADRID),
        "minute",
        reporters,
      ),
    ],
    refs: [{ operatorId: CIERZO, kind: "expedition", value: row.expedicion }],
    deadlines: row.deadlines ?? [],
  };

  const { actual } = row;
  const cierzo = cierzoFeed(row.expedicion);
  const messages = present<SeedMessage>([
    actual.pickedUp && cierzo.milestone("PICKED_UP", site.place, actual.pickedUp),
    actual.hubIn && cierzo.milestone("HUB_IN", row.platform, actual.hubIn),
    actual.outForDelivery &&
      cierzo.milestone("OUT_FOR_DELIVERY", row.platform, actual.outForDelivery),
    actual.delivered &&
      cierzo.milestone("DELIVERED", destination, actual.delivered, actual.deliveryRemark),
    ...(actual.also?.(cierzo) ?? []),
  ]);

  const documents = present<SeedDocument>([
    actual.pickedUp && { docType: "delivery_note", at: at(actual.pickedUp, MADRID), source: IBON },
    row.proofOfDelivery !== undefined && {
      docType: "proof_of_delivery",
      at: at(row.proofOfDelivery, MADRID),
      source: CIERZO,
    },
  ]);

  return { shipment, bookedAt: at(actual.booked, MADRID), messages, documents };
}
