import type { ExceptionType } from "@/domain/log";
import type { Deadline, DocumentType, MilestoneCode, ShipmentId } from "@/domain/shipment";
import type { Instant, Zone } from "@/domain/time";

/** A case whose outcome a person can still change before its deadline. */
export type DigestCase = {
  shipmentId: ShipmentId;
  exception: ExceptionType;
  deadline: {
    kind: Deadline["kind"];
    at: Instant;
    zone: Zone;
    /** The milestone the deadline protects or re-starts, when the booking names one. */
    milestone: { code: MilestoneCode; place: string } | null;
  };
  /** Documents that are still to be sent for the case. */
  documents: DocumentType[];
  vessel: string | null;
};

/** Computed by rules; the writer only puts them into a sentence. Nearest deadline first. */
export type DigestFacts = { now: Instant; cases: DigestCase[] };

/** One sentence over computed facts. `null` means there is nothing worth a sentence. */
export interface DigestWriter {
  highlight(facts: DigestFacts): Promise<string | null>;
}
