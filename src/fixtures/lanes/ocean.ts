import { CIERZO } from "@/adapters/operators/cierzo/mapping";
import { NORAY } from "@/adapters/operators/noray/mapping";
import { TURIA } from "@/adapters/operators/turia/mapping";
import {
  IBON,
  milestoneKey,
  type DocumentType,
  type OperatorRef,
  type Shipment,
} from "@/domain/shipment";
import { addDays, formatDay, HOUR, type LocalDate } from "@/domain/time";
import { at, day, MADRID, MEXICO } from "../calendar";
import type { Consignee } from "../directory";
import { cierzoFeed, norayFeed, turiaFeed, type SeedMessage } from "../feed";
import { VALENCIA_PORT, VERACRUZ_PORT } from "../places";
import { planned, present, siteOf, type SeedDocument, type SeededShipment } from "./shared";

/** A weekly Friday sailing, Valencia to Veracruz, fourteen days. */
export type Sailing = { vessel: string; voyage: string; sails: LocalDate; arrives: LocalDate };

/**
 * The ocean lane plan, relative to the sailing Friday: when the truck collects at each site and
 * when it reaches the terminal. The warehouse is 30 km from the port; the plants are a day away.
 */
const PRE_CARRIAGE: Record<string, { pickup: [daysBefore: number, time: string]; gateIn: string }> =
  {
    ZAZ: { pickup: [4, "15:00"], gateIn: "08:00" },
    BIO: { pickup: [4, "10:00"], gateIn: "08:00" },
    VLC: { pickup: [3, "08:30"], gateIn: "11:00" },
  };

export type OceanRow = {
  id: string;
  orderRef: string;
  siteId: string;
  consignee: Consignee;
  committed: LocalDate;
  cargo: Required<Shipment["cargo"]>;
  sailing: Sailing;
  refs: { cierzo: string; booking: string; billOfLading?: string; turia: string };
  /** Where this booking departs from the lane plan. Times are Madrid wall-clock. */
  replanned?: { booked?: string; pickedUp?: string; gateIn?: string; exportReleased?: LocalDate };
  /** What has happened so far, each time local to the place where it happened. */
  actual: {
    booked: string;
    pickedUp?: string;
    gateIn?: { cierzo: string; noray: string };
    exportReleased?: { on: LocalDate; mrn: string };
    loaded?: string;
    billOfLading?: LocalDate;
    discharged?: string;
    importLodged?: LocalDate;
    importReleased?: LocalDate;
    gateOut?: string;
    delivered?: LocalDate;
    /** Turia's door ETAs, each with the Madrid time its report arrived. */
    doorEstimates?: { date: LocalDate; received: string; remark?: string }[];
    /** Anything the lane cannot express, written by hand. */
    also?: (turia: ReturnType<typeof turiaFeed>) => SeedMessage[];
  };
  notOnFile?: DocumentType[];
  /** When the proof of delivery came back, Madrid wall-clock. */
  proofOfDelivery?: string;
};

export function oceanShipment(row: OceanRow): SeededShipment {
  const site = siteOf(row.siteId);
  const lane = PRE_CARRIAGE[row.siteId];
  if (!lane) throw new Error(`No pre-carriage plan from ${row.siteId}`);
  const { sails, arrives, vessel, voyage } = row.sailing;
  const destination = row.consignee.place;

  const plan = [
    planned(
      "BOOKED",
      null,
      site.place,
      at(row.replanned?.booked ?? `${addDays(sails, -9)} 10:00`, MADRID),
      "minute",
      [IBON],
    ),
    planned(
      "PICKED_UP",
      "pre-carriage",
      site.place,
      at(row.replanned?.pickedUp ?? `${addDays(sails, -lane.pickup[0])} ${lane.pickup[1]}`, MADRID),
      "minute",
      [CIERZO],
    ),
    // The line's gate transaction is the authority; the haulier's "entered terminal" corroborates it.
    planned(
      "GATE_IN",
      "origin-port",
      VALENCIA_PORT,
      at(row.replanned?.gateIn ?? `${addDays(sails, -3)} ${lane.gateIn}`, MADRID),
      "minute",
      [NORAY, CIERZO],
    ),
    planned(
      "EXPORT_RELEASED",
      "origin-port",
      VALENCIA_PORT,
      day(row.replanned?.exportReleased ?? addDays(sails, -2)),
      "day",
      [TURIA],
    ),
    planned("LOADED", "origin-port", VALENCIA_PORT, at(`${sails} 03:00`, MADRID), "minute", [
      NORAY,
    ]),
    planned("VESSEL_DEPARTED", "sea", VALENCIA_PORT, at(`${sails} 20:00`, MADRID), "minute", [
      NORAY,
    ]),
    planned("VESSEL_ARRIVED", "sea", VERACRUZ_PORT, at(`${arrives} 06:00`, MEXICO), "minute", [
      NORAY,
    ]),
    planned(
      "DISCHARGED",
      "destination-port",
      VERACRUZ_PORT,
      at(`${addDays(arrives, 1)} 10:00`, MEXICO),
      "minute",
      [NORAY],
    ),
    planned("IMPORT_LODGED", "destination-port", VERACRUZ_PORT, day(addDays(arrives, 3)), "day", [
      TURIA,
    ]),
    planned("IMPORT_RELEASED", "destination-port", VERACRUZ_PORT, day(addDays(arrives, 4)), "day", [
      TURIA,
    ]),
    planned(
      "GATE_OUT",
      "destination-port",
      VERACRUZ_PORT,
      at(`${addDays(arrives, 4)} 15:00`, MEXICO),
      "minute",
      [NORAY],
    ),
    planned("DELIVERED", "final-leg", destination, day(addDays(arrives, 5)), "day", [TURIA]),
  ];

  const refs: OperatorRef[] = present([
    { operatorId: CIERZO, kind: "expedition", value: row.refs.cierzo },
    { operatorId: NORAY, kind: "booking", value: row.refs.booking },
    { operatorId: NORAY, kind: "container", value: row.cargo.container.number },
    row.refs.billOfLading
      ? { operatorId: NORAY, kind: "bill_of_lading", value: row.refs.billOfLading }
      : undefined,
    { operatorId: TURIA, kind: "forwarder_file", value: row.refs.turia },
  ]);

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
        id: "pre-carriage",
        kind: "road",
        operatorId: CIERZO,
        from: site.place,
        to: VALENCIA_PORT,
        telematics: false,
      },
      { id: "origin-port", kind: "port", place: VALENCIA_PORT, gate: "export" },
      { id: "sea", kind: "sea", operatorId: NORAY, from: VALENCIA_PORT, to: VERACRUZ_PORT },
      { id: "destination-port", kind: "port", place: VERACRUZ_PORT, gate: "import" },
      {
        id: "final-leg",
        kind: "road",
        operatorId: TURIA,
        from: VERACRUZ_PORT,
        to: destination,
        telematics: false,
      },
    ],
    plan,
    refs,
    voyage: { vessel, voyage },
    deadlines: [
      {
        kind: "export_cutoff",
        at: at(`${addDays(sails, -1)} 12:00`, MADRID),
        label: `Export clearance cut-off for ${vessel} ${voyage}`,
        consequence: `Missing ${vessel} means the next sailing, ${formatDay(addDays(sails, 7))}: 7 days later`,
        milestoneKey: milestoneKey("EXPORT_RELEASED", VALENCIA_PORT),
      },
      {
        kind: "free_time_end",
        at: at(`${addDays(arrives, 7)} 23:59`, MEXICO),
        label: "Free time ends: demurrage starts",
        milestoneKey: milestoneKey("GATE_OUT", VERACRUZ_PORT),
      },
    ],
  };

  const { actual } = row;
  const cierzo = cierzoFeed(row.refs.cierzo);
  const noray = norayFeed(row.cargo.container.number);
  const turia = turiaFeed(row.refs.turia, row.orderRef);
  const messages = present<SeedMessage>([
    actual.pickedUp && cierzo.milestone("PICKED_UP", site.place, actual.pickedUp),
    actual.gateIn && cierzo.milestone("GATE_IN", VALENCIA_PORT, actual.gateIn.cierzo),
    actual.gateIn && noray.equipment("GATE_IN", VALENCIA_PORT, actual.gateIn.noray),
    actual.exportReleased &&
      turia.milestone(
        "EXPORT_RELEASED",
        actual.exportReleased.on,
        `MRN ${actual.exportReleased.mrn}`,
      ),
    actual.loaded && noray.equipment("LOADED", VALENCIA_PORT, actual.loaded),
    actual.billOfLading && turia.billOfLading(actual.billOfLading),
    actual.discharged && noray.equipment("DISCHARGED", VERACRUZ_PORT, actual.discharged),
    actual.importLodged && turia.milestone("IMPORT_LODGED", actual.importLodged),
    actual.importReleased && turia.milestone("IMPORT_RELEASED", actual.importReleased),
    actual.gateOut && noray.equipment("GATE_OUT", VERACRUZ_PORT, actual.gateOut),
    actual.delivered && turia.milestone("DELIVERED", actual.delivered),
    ...(actual.doorEstimates ?? []).map((estimate) =>
      turia.doorEstimate(estimate.date, estimate.received, estimate.remark),
    ),
    ...(actual.also?.(turia) ?? []),
  ]);

  const bookedAt = at(actual.booked, MADRID);
  const ownPapers: DocumentType[] = ["commercial_invoice", "packing_list"];
  const documents = present<SeedDocument>([
    ...ownPapers
      .filter((docType) => !row.notOnFile?.includes(docType))
      .map((docType) => ({ docType, at: bookedAt + 2 * HOUR, source: IBON })),
    actual.exportReleased && {
      docType: "export_declaration",
      at: day(actual.exportReleased.on),
      source: TURIA,
    },
    row.proofOfDelivery !== undefined && {
      docType: "proof_of_delivery",
      at: at(row.proofOfDelivery, MADRID),
      source: TURIA,
    },
  ]);

  return { shipment, bookedAt, messages, documents };
}
