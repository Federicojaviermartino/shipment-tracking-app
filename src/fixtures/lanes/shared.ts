import type { Site } from "@/domain/directory";
import {
  milestoneKey,
  type DocumentType,
  type MilestoneCode,
  type Place,
  type PlannedMilestone,
  type Shipment,
  type Source,
} from "@/domain/shipment";
import type { Instant, Precision } from "@/domain/time";
import { SITES } from "../directory";
import type { SeedMessage } from "../feed";

/** A document on file at T0: metadata only, as everywhere in the prototype. */
export type SeedDocument = { docType: DocumentType; at: Instant; source: Source };

/**
 * One shipment of the roster: the booking, what the operators have said about it so far and the
 * documents on file. Stage, health and verdict are never authored: they are derived.
 */
export type SeededShipment = {
  shipment: Shipment;
  bookedAt: Instant;
  messages: SeedMessage[];
  documents: SeedDocument[];
};

export function siteOf(siteId: string): Site {
  const site = SITES.find((candidate) => candidate.id === siteId);
  if (!site) throw new Error(`Unknown site ${siteId}`);
  return site;
}

export function planned(
  code: MilestoneCode,
  sectionId: string | null,
  place: Place,
  plannedAt: Instant,
  precision: Precision,
  reporters: Source[],
): PlannedMilestone {
  return {
    key: milestoneKey(code, place),
    code,
    sectionId,
    place,
    plannedAt,
    precision,
    reporters,
  };
}

/** Keeps what is there: lets a list say "this message, if that has happened". */
export function present<T extends object>(items: (T | undefined | false | "")[]): T[] {
  return items.filter((item): item is T => typeof item === "object");
}
