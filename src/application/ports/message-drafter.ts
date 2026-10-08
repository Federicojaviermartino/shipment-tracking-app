import type { ExceptionType } from "@/domain/log";
import type {
  Deadline,
  DocumentType,
  HoldKind,
  MilestoneCode,
  ShipmentId,
} from "@/domain/shipment";
import type { Instant, LocalDate, Precision, Zone } from "@/domain/time";

/** A moment at a place: rendered in that place's local time, never with a time of day for a day. */
export type Moment = { at: Instant; precision: Precision; zone: Zone };

/**
 * Everything a draft may say, computed by rules from the shipment record. A fact that does not
 * apply is `null`; the drafter may use fewer facts than it is given, never one that is not here.
 */
export type DraftFacts = {
  /** Local day at the destination when the draft is written. */
  today: LocalDate;
  committed: LocalDate;
  planned: LocalDate | null;
  operatorDoor: { day: LocalDate; by: string; superseded: boolean } | null;
  estelaDoor: {
    day: LocalDate;
    assumption: string | null;
    assumedRelease: LocalDate | null;
  } | null;
  /** The door day a customer notice will publish, whatever its wording. */
  published: { day: LocalDate; basis: "operator_estimate" | "estela_estimate" } | null;
  /** An operator moved its estimate for an earlier milestone, and the door date follows. */
  upstream: {
    milestone: MilestoneCode;
    place: string;
    now: Moment;
    was: Moment | null;
    by: string;
    remark: string | null;
  } | null;
  hold: { kind: HoldKind; reason: string; by: string; place: string | null; since: Moment } | null;
  /** The last place the cargo was reported at, and the report that was expected next. */
  overdue: {
    last: { milestone: MilestoneCode; place: string; at: Moment };
    expected: { milestone: MilestoneCode; place: string; at: Moment };
  } | null;
  silence: { hours: number; lastPlace: string | null; since: Moment; by: string } | null;
  deadline: {
    kind: Deadline["kind"];
    label: string;
    at: Moment;
    consequence: string | null;
    milestone: { code: MilestoneCode; place: string } | null;
  } | null;
  document: {
    docType: DocumentType;
    fileName: string;
    /** It replaces one that customs or the broker rejected. */
    corrected: boolean;
    /** When we last sent it out, if we did. */
    sentOn: LocalDate | null;
  } | null;
  /** Whether the operator has already been asked about this case. */
  operatorContacted: boolean;
  /** What the operator wrote in its own words, most recent first: source material, never copy. */
  remarks: { text: string; at: Moment; by: string }[];
  /** Where the container entered the terminal, for a message about export clearance. */
  gateIn: { place: string; at: Moment } | null;
};

export type DraftRequest = {
  audience: "customer" | "operator";
  step: "notify_customer" | "contact_operator" | "send_document";
  exception: ExceptionType;
  basis: "declared" | "inferred" | "rule";
  now: Instant;
  shipment: {
    id: ShipmentId;
    orderRef: string;
    destination: string;
    zone: Zone;
    packages: string;
    vessel: string | null;
    container: string | null;
    /** The consignee is the importer of record: an import matter is never "nothing for you to do". */
    consigneeClearsImport: boolean;
  };
  /** Whom the message is for; for an operator, with its own reference for the shipment. */
  recipient: { name: string; reference: string | null };
  facts: DraftFacts;
};

export type DraftText = {
  subject: string;
  body: string;
  /** The keys of `DraftFacts` the text was written from. */
  factsUsed: string[];
};

/** Customer notices and messages to operators: facts in, words out. Nothing is sent by a draft. */
export interface MessageDrafter {
  draft(request: DraftRequest): Promise<DraftText>;
}
