import { documentEvents, internalEvents, type LoggedEvent } from "./log";
import {
  hasSeaLeg,
  isInternational,
  type DocumentType,
  type MilestoneCode,
  type Shipment,
  type Source,
} from "./shipment";
import { milestonesOf, type Timeline } from "./timeline";
import type { Instant } from "./time";

/**
 * `not_yet_due`: the document cannot exist yet (a bill of lading before loading), so calling it
 * missing would be a false alarm. `pending`: expected and normal to wait for (a signed proof of
 * delivery comes back days later). `sent`: we sent it out and nobody has acknowledged it yet.
 */
export type DocumentStatus = "on_file" | "missing" | "not_yet_due" | "pending" | "sent";

export type DocumentRequirement = {
  docType: DocumentType;
  /** The document is expected once this milestone is confirmed. */
  dueFrom: MilestoneCode;
  whenAbsent: "missing" | "pending";
  /** The milestone that cannot happen without it. */
  neededFor?: MilestoneCode;
};

const PROOF_OF_DELIVERY: DocumentRequirement = {
  docType: "proof_of_delivery",
  dueFrom: "DELIVERED",
  whenAbsent: "pending",
};

const OCEAN: DocumentRequirement[] = [
  {
    docType: "commercial_invoice",
    dueFrom: "PICKED_UP",
    whenAbsent: "missing",
    neededFor: "EXPORT_RELEASED",
  },
  {
    docType: "packing_list",
    dueFrom: "PICKED_UP",
    whenAbsent: "missing",
    neededFor: "EXPORT_RELEASED",
  },
  { docType: "export_declaration", dueFrom: "EXPORT_RELEASED", whenAbsent: "missing" },
  { docType: "bill_of_lading", dueFrom: "LOADED", whenAbsent: "missing" },
  PROOF_OF_DELIVERY,
];

const ROAD_INTERNATIONAL: DocumentRequirement[] = [
  { docType: "cmr", dueFrom: "PICKED_UP", whenAbsent: "missing" },
  PROOF_OF_DELIVERY,
];

const ROAD_DOMESTIC: DocumentRequirement[] = [
  { docType: "delivery_note", dueFrom: "PICKED_UP", whenAbsent: "missing" },
  PROOF_OF_DELIVERY,
];

export function requirementsFor(shipment: Shipment): DocumentRequirement[] {
  if (hasSeaLeg(shipment)) return OCEAN;
  return isInternational(shipment) ? ROAD_INTERNATIONAL : ROAD_DOMESTIC;
}

export type DocumentFile = {
  fileName: string;
  at: Instant;
  source: Source;
  customerVisible: boolean;
};

export type RequiredDocument = {
  docType: DocumentType;
  status: DocumentStatus;
  neededFor?: MilestoneCode;
  file?: DocumentFile;
  sentAt?: Instant;
};

export function documentStatuses(
  shipment: Shipment,
  timeline: Timeline,
  events: readonly LoggedEvent[],
): RequiredDocument[] {
  const own = events.filter((event) => event.shipmentId === shipment.id);
  const confirmed = new Set(
    milestonesOf(timeline)
      .filter((entry) => entry.actual !== undefined)
      .map((entry) => entry.code),
  );

  return requirementsFor(shipment).map((requirement): RequiredDocument => {
    const file = documentEvents(own)
      .filter((event) => event.docType === requirement.docType)
      .sort((a, b) => a.at - b.at)
      .at(-1);
    const sentAt = internalEvents(own)
      .filter((event) => event.type === "document_sent" && event.docType === requirement.docType)
      .map((event) => event.at)
      .sort((a, b) => a - b)
      .at(-1);

    let status: DocumentStatus;
    if (sentAt !== undefined && (!file || sentAt > file.at)) status = "sent";
    else if (file) status = "on_file";
    else status = confirmed.has(requirement.dueFrom) ? requirement.whenAbsent : "not_yet_due";

    return {
      docType: requirement.docType,
      status,
      ...(requirement.neededFor ? { neededFor: requirement.neededFor } : {}),
      ...(file
        ? {
            file: {
              fileName: file.fileName,
              at: file.at,
              source: file.source,
              customerVisible: file.customerVisible,
            },
          }
        : {}),
      ...(sentAt !== undefined ? { sentAt } : {}),
    };
  });
}

/** The exporter's customs filing is internal; everything else is the consignee's to see. */
export function isCustomerVisible(docType: DocumentType): boolean {
  return docType !== "export_declaration";
}

export function defaultFileName(docType: DocumentType, shipment: Shipment): string {
  return `${docType.replace(/_/g, "-")}-${shipment.orderRef}.pdf`;
}
