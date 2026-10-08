import type { Verdict } from "@/domain/customer-view";
import type { DocumentStatus } from "@/domain/documents";
import type { EstimateStepSource } from "@/domain/estimate";
import type { EvidenceProvenance, ExceptionHealth, Health } from "@/domain/exceptions";
import type { ShipmentFilter } from "@/domain/filters";
import type { Channel, ExceptionType, PublishedSnapshot } from "@/domain/log";
import type { Actor } from "@/domain/perimeter";
import type { CaseState, Step, StepKind } from "@/domain/playbook";
import type {
  AccountId,
  Country,
  Deadline,
  DocumentType,
  HoldKind,
  MilestoneCode,
  OperatorId,
  Section,
  ShipmentId,
  SiteId,
} from "@/domain/shipment";
import type { ImportGateState, Stage } from "@/domain/stage";
import type { Instant, LocalDate, Precision, Zone } from "@/domain/time";
import type { MilestoneEntry, NoteEntry, ReadingState } from "@/domain/timeline";

/**
 * What the gateway hands to a screen: everything it needs in one read. Instants are epoch
 * milliseconds and always travel with the zone they must be shown in; a `LocalDate` is a day at
 * the destination. Sentences arrive composed, so that no component ever builds one.
 */

export type PlaceView = { name: string; country: Country; zone: Zone };

/** A moment at a place. A `day` precision value never shows a time of day. */
export type WhenView = { at: Instant; precision: Precision; zone: Zone };

/** Where a date comes from, in the product's provenance grammar. */
export type DateProvenance = "confirmed" | "declared" | "estimated" | "planned";

// --- route strip ---

export type RouteView = {
  /** One more stop than legs: origin, every port, destination. */
  stops: {
    name: string;
    /** "Plant", "Port · import customs", "Consignee". */
    caption: string;
    /** A port with a customs gate. */
    gate: boolean;
    problem: ExceptionHealth | null;
  }[];
  legs: { mode: "road" | "sea"; operator: string; problem: ExceptionHealth | null }[];
  /** Where the cargo is: waiting at a stop or under way on a leg. `null` once delivered. */
  position: { on: "stop" | "leg"; index: number } | null;
  /** The position is the last one known and an update is overdue. */
  stale: boolean;
  /** The route and the position in words. */
  label: string;
};

// --- the three dates ---

export type EstimateStepView = {
  milestoneKey: string;
  label: string;
  when: WhenView;
  from: EstimateStepSource;
  /** "declared by Noray Lines", "vessel schedule", "lane plan", "next departure", "assumed". */
  fromLabel: string;
};

export type EstelaView =
  | {
      kind: "estimate";
      day: LocalDate;
      at: Instant;
      window: { earliest: LocalDate; latest: LocalDate };
      /** "Rule-based estimate". */
      basis: string;
      agreesWithOperator: boolean;
      /** Days after the committed date; zero or negative is in time. */
      lateBy: number;
      /** "Delivery estimate Fri 16 Oct (was Wed 14 Oct)." */
      headline: string;
      steps: EstimateStepView[];
      /** "Firms up when the vessel berths." */
      firmsUp: string | null;
      /** "Assumes: if the corrected invoice reaches the broker today." */
      assumption: string | null;
    }
  /** "No estimate: no position from Eisvogel Spedition for 27 h." */
  | { kind: "withheld"; line: string };

export type DatesView = {
  /** The destination zone: every day below is a local day there. */
  zone: Zone;
  committed: LocalDate;
  delivered: { day: LocalDate; when: WhenView; by: string } | null;
  operator: {
    day: LocalDate;
    when: WhenView;
    /** Who declared it, by name. */
    by: string;
    declaredAt: Instant;
    lateBy: number;
    superseded: boolean;
    /** "declared Tue 6 Oct, before the vessel delay": why a superseded estimate is struck through. */
    supersededNote: string | null;
  } | null;
  /** The operator took its estimate back. */
  withdrawn: { day: LocalDate; by: string; at: Instant; line: string } | null;
  /** `null` once delivered: there is nothing left to estimate. */
  estela: EstelaView | null;
  /**
   * The one date to show when there is room for one: delivered, else the operator's unless
   * superseded, else Estela's, else the plan while it can still be met.
   */
  best: {
    day: LocalDate;
    when: WhenView;
    provenance: DateProvenance;
    by: string | null;
    lateBy: number;
  } | null;
  /** Why there is no best date, when there is none. */
  bestMissing: string | null;
};

// --- cases ---

export type StepView = {
  kind: StepKind;
  /** "Send the corrected commercial invoice to Turia Global Forwarding". */
  label: string;
  /** What the button says: "Send invoice", "Review notice", "Confirm reading". */
  action: string;
  state: Step["state"];
  /** Whether this actor may do it now. */
  allowed: boolean;
  /** "Needs the Logistics role. Ask Marta Soler." */
  disabledReason: string | null;
  done: { by: string; at: Instant } | null;
  operator: { id: OperatorId; name: string } | null;
  docType: DocumentType | null;
  /** The reading to confirm, for `confirm_reading`. */
  eventKey: string | null;
};

export type ClockView = {
  kind: "now" | Deadline["kind"];
  at: Instant;
  zone: Zone;
  /** "Now", "Act within 4 h", "Cut-off in 20 h", "Free time ends Fri 9 Oct". */
  label: string;
  /** "Next linehaul leaves the Perpignan hub, Wed 7 Oct 20:00". */
  detail: string;
};

export type EvidenceView = {
  text: string;
  provenance: EvidenceProvenance["kind"];
  /** For `ai_reading`: whether a person has confirmed it. */
  confirmed: boolean;
  /** Who said it, by name. */
  source: string | null;
  receivedAt: Instant | null;
  /** The timeline entry behind the line, to scroll to. */
  entryId: string | null;
};

export type RawMessageView = {
  id: string;
  /** Who sent it, by name. */
  source: string;
  channel: Channel;
  /** "CSV file", "Webhook", "API", "Daily report", "Email". */
  channelLabel: string;
  receivedAt: Instant;
  /** The payload exactly as it arrived. */
  body: string;
};

/** What a model read in a free-text message, and what a person decided about it. */
export type ReadingView = {
  eventKey: string;
  state: Exclude<ReadingState, "table">;
  /** What was read, in words. */
  text: string;
  source: string;
  reviewedBy: string | null;
  original: RawMessageView | null;
};

export type CaseView = {
  /** Stable while the rule fires: `${shipmentId}:${type}`. */
  id: string;
  type: ExceptionType;
  health: ExceptionHealth;
  basis: "declared" | "inferred" | "rule";
  state: CaseState;
  /** The case shown in the shipment's row of the queue. */
  primary: boolean;
  needsConfirmation: boolean;
  /** "At risk: estimate 1 day after the committed date". */
  title: string;
  /** The one line of "why it is here". */
  why: string;
  clock: ClockView | null;
  /** The first step that is not done. */
  nextStep: StepView | null;
  steps: StepView[];
  evidence: EvidenceView[];
  /** "Your part is done. Waiting on customs." when every step is done and the rule still fires. */
  waiting: string | null;
  reading: ReadingView | null;
};

// --- operations ---

export type AccountView = { id: AccountId; name: string; type: "customer" | "subsidiary" };

export type StageView = {
  code: Stage;
  label: string;
  importGate: ImportGateState | null;
  /** "on NORAY ALTAIR 612W", "last position Nîmes, FR": what a row says under the stage. */
  detail: string | null;
};

export type OpsRow = {
  id: ShipmentId;
  orderRef: string;
  account: AccountView;
  origin: { siteId: SiteId; siteName: string; place: PlaceView };
  destination: { name: string; place: PlaceView };
  /** "Zaragoza → Querétaro, MX". */
  lane: string;
  route: RouteView;
  stage: StageView;
  health: Health;
  healthLabel: string;
  /** The primary exception, when one is open. */
  case: CaseView | null;
  /** How many more exceptions are open on the shipment. */
  otherCases: number;
  dates: DatesView;
  /** The latest fact from an operator, for the age shown in the row. */
  lastUpdate: { at: Instant; by: string } | null;
};

export type FilterChip = { field: keyof ShipmentFilter; label: string };

export type OpsOverview = {
  /** "Logistics · All sites · 23 shipments". */
  identity: string;
  counts: {
    attention: number;
    waiting: number;
    all: number;
    delayed: number;
    held: number;
    atRisk: number;
    stale: number;
    onPlan: number;
    deliveredSinceYesterday: number;
  };
  /** "6 need you: 1 delayed, 2 held, 2 at risk, 1 stale. 11 on plan. 4 delivered since yesterday." */
  line: string;
  /** When the latest operator fact about any shipment in the perimeter was received. */
  lastOperatorUpdateAt: Instant | null;
  /** What the manual filters may offer: the vocabulary of the perimeter, nothing beyond it. */
  filterOptions: {
    countries: { code: Country; name: string }[];
    sites: { id: SiteId; name: string }[];
    accounts: { id: AccountId; name: string }[];
    operators: { id: OperatorId; name: string }[];
    vessels: string[];
  };
  /** Questions the ask bar offers, so that nobody faces a blank box. */
  suggestions: string[];
};

/** The one generated sentence of the briefing. */
export type DigestHighlight = {
  text: string;
  /** "Written by AI from the 2 nearest deadlines". */
  caption: string;
  shipmentIds: ShipmentId[];
};

export type TimelineSourceView = {
  operatorId: string;
  name: string;
  /** When it happened according to this source. */
  when: WhenView;
  original: RawMessageView | null;
};

export type TimelineEntryView =
  | {
      type: "milestone";
      /** Unique in the shipment: the anchor an evidence line points to. */
      id: string;
      code: MilestoneCode;
      label: string;
      place: PlaceView;
      state: MilestoneEntry["state"];
      unplanned: boolean;
      /** The only slot a fact can occupy. */
      actual: WhenView | null;
      operatorEstimate: {
        when: WhenView;
        by: string;
        declaredAt: Instant;
        remark: string | null;
        original: RawMessageView | null;
      } | null;
      /** The operator's last estimate, taken back. */
      withdrawn: { when: WhenView; by: string; at: Instant } | null;
      planned: WhenView | null;
      /** What Estela's chain says for this milestone, when it is still ahead. Operations only. */
      estela: WhenView | null;
      /** Everyone who confirmed it, the authority first. */
      sources: TimelineSourceView[];
      reading: { state: ReadingState; reviewedBy: string | null } | null;
    }
  | {
      type: "hold";
      id: string;
      hold: HoldKind;
      label: string;
      open: boolean;
      reason: string;
      raised: WhenView;
      clearedAt: Instant | null;
      reading: { state: ReadingState; reviewedBy: string | null };
      source: TimelineSourceView;
    }
  | {
      type: "position";
      id: string;
      lastPlace: string;
      /** How many positions stand behind this one line. */
      count: number;
      /** An update is overdue: the marker turns hollow. */
      stale: boolean;
      source: TimelineSourceView;
    }
  | {
      type: "note";
      id: string;
      text: string;
      /** Why something reported as more than a remark is shown as one. */
      status: NoteEntry["status"] | null;
      statusLabel: string | null;
      source: TimelineSourceView;
    }
  | {
      type: "action";
      id: string;
      label: string;
      /** Who did it, by name. */
      by: string;
      when: WhenView;
    };

export type TimelineSectionView = {
  id: string;
  kind: Section["kind"];
  /** "Road", "Port of Veracruz", "Sea". */
  title: string;
  /** "Noray Lines · NORAY ALTAIR 612W · Valencia → Veracruz". */
  detail: string;
  entries: TimelineEntryView[];
};

export type TimelineView = {
  /** Above the first section: the booking, and whatever happened before the cargo moved. */
  lead: TimelineEntryView[];
  sections: TimelineSectionView[];
  /** Where the "Now" rule falls: after an entry of a section, or of the lead (`sectionId: null`). */
  now: { sectionId: string | null; afterEntryId: string | null; stale: boolean };
};

export type DocumentView = {
  docType: DocumentType;
  label: string;
  status: DocumentStatus;
  /** "On file", "Missing", "Not due yet", "Pending", "Sent, awaiting acknowledgement". */
  statusLabel: string;
  /** "Needed for export customs release". */
  neededFor: string | null;
  fileName: string | null;
  /** When it was filed, or when we sent it. */
  at: Instant | null;
  /** Who filed it, by name. */
  by: string | null;
  customerVisible: boolean;
};

export type SentMessageView = {
  id: string;
  kind: "customer_notice" | "operator_message" | "document";
  /** "Aquabajío Ingeniería (customer)", "Eisvogel Spedition". */
  to: string;
  subject: string;
  body: string;
  /** Who approved and sent it, by name. */
  by: string;
  at: Instant;
  attachment: string | null;
  /** For a notice: the door day it told the customer. */
  publishedDay: LocalDate | null;
};

/** The delivery date a customer currently sees, with the words that go with it. */
export type PublishedView =
  | { kind: "confirmed" | "planned"; day: LocalDate; when: WhenView; line: string }
  | {
      kind: "estimated";
      day: LocalDate;
      when: WhenView;
      by: "carrier" | "notice";
      /** Who approved the notice, by name. */
      approvedBy: string | null;
      /** "Estimated by the carrier", "Estimated by Ibón logistics, approved by Marta Soler". */
      line: string;
    }
  /** "Delivery date under review (was Wed 14 Oct)". */
  | { kind: "under_review"; was: LocalDate | null; line: string };

export type CustomerSeesView = { verdict: Verdict; verdictLabel: string; published: PublishedView };

export type OpsShipmentView = OpsRow & {
  /** "DAP Querétaro: the consignee clears import". */
  incotermLine: string;
  cargo: {
    description: string;
    packages: string;
    grossWeightKg: number;
    container: { size: string; number: string } | null;
  };
  voyage: { vessel: string; voyage: string } | null;
  /** Every open exception, worst first. */
  cases: CaseView[];
  /** The verdict and the date exactly as the portal shows them. */
  customerSees: CustomerSeesView;
  timeline: TimelineView;
  documents: DocumentView[];
  references: { label: string; value: string; holder: string }[];
  messages: SentMessageView[];
};

// --- asking ---

export type AskResult =
  | {
      kind: "filter";
      filter: ShipmentFilter;
      /** One per recognised constraint, with resolved values: "Due: this week, 5–11 Oct". */
      chips: FilterChip[];
      notUsed: string[];
      rows: OpsRow[];
    }
  | { kind: "answer"; shipmentId: ShipmentId; statusLine: string; row: OpsRow }
  | { kind: "unsupported"; message: string; shipmentId: ShipmentId | null }
  | { kind: "not_found"; reference: string; message: string }
  | { kind: "not_understood"; text: string; message: string; rows: OpsRow[] };

// --- drafting ---

export type FactLine = {
  /** The fact's key in the sheet the drafter was given. */
  id: string;
  label: string;
  value: string;
  provenance: DateProvenance | "committed" | "ai_reading" | "record";
  /** Who stands behind it, by name. */
  source: string | null;
  /** Every calendar day the fact carries: a draft may mention these and no others. */
  dates: LocalDate[];
  /** Whether the draft was written from it. */
  used: boolean;
};

export type Draft = {
  shipmentId: ShipmentId;
  step: Exclude<StepKind, "confirm_reading">;
  exception: ExceptionType;
  audience: "customer" | "operator";
  /** "Customer notice", "Message to Eisvogel Spedition", "Send document to Turia Global Forwarding". */
  title: string;
  to: { name: string; channel: string };
  subject: string;
  body: string;
  /** `false` when the assistant failed: subject and body are empty and the facts still stand. */
  writtenByAi: boolean;
  facts: FactLine[];
  /** For a document: what goes with the message. */
  attachment: { docType: DocumentType; label: string; suggestedFileName: string } | null;
  operatorId: OperatorId | null;
  /** For a customer notice: the door date approving it publishes, taken from the record. */
  publishes: PublishedSnapshot | null;
  /** For a customer notice: what the customer sees now and what they will see once it is sent. */
  changes: { from: CustomerSeesView; to: CustomerSeesView } | null;
};

// --- portal ---

export type PortalNoticeView = {
  id: string;
  shipmentId: ShipmentId;
  orderRef: string;
  at: Instant;
  /** Who approved it, by name. */
  approvedBy: string;
  subject: string;
  body: string;
  /** The verdict of its shipment now, for the status bar of the card. */
  verdict: Verdict;
};

export type PortalCard = {
  id: ShipmentId;
  orderRef: string;
  /** "3 pump sets · MV 150 pump sets". */
  cargo: string;
  destination: string;
  route: RouteView;
  stage: { code: Stage; label: string };
  verdict: Verdict;
  verdictLabel: string;
  published: PublishedView;
  /** The time of the last confirmed update: the portal shows its age, never the word "stale". */
  lastUpdateAt: Instant | null;
};

export type PortalHome = {
  account: { id: AccountId; name: string };
  counts: { onTheWay: number; needAttention: number; delivered: number };
  /** "7 shipments on the way. 1 needs your attention." */
  summary: string;
  /** Approved notices of shipments still on the way, newest first. */
  notices: PortalNoticeView[];
  /** Delayed or on hold. */
  attention: PortalCard[];
  onTheWay: PortalCard[];
  /** Delivered in the last 30 days. */
  delivered: PortalCard[];
};

export type PortalShipmentView = PortalCard & {
  consignee: string;
  committed: LocalDate;
  /** The destination zone: committed and published days are local days there. */
  zone: Zone;
  /** "2 days later than committed", when the published date is later. */
  difference: string | null;
  /** One line: the subject of the latest approved notice, or fixed wording for a fact. */
  reason: string | null;
  notices: PortalNoticeView[];
  milestones: {
    key: string;
    code: MilestoneCode;
    label: string;
    place: PlaceView;
    state: MilestoneEntry["state"];
    /** `null` reads "Not reported" or "No estimate yet": never a made-up time. */
    when: (WhenView & { kind: "confirmed" | "estimated" | "planned" }) | null;
  }[];
  holds: { hold: HoldKind; label: string; since: Instant }[];
  documents: { docType: DocumentType; label: string; fileName: string; at: Instant }[];
  references: { label: string; value: string }[];
  /** "DAP Querétaro: you clear import". */
  incotermLine: string;
};

// --- live ---

/** What an operator update means for the desk, as a toast. */
export type FeedNotice = {
  operatorName: string;
  /** "NORAY ALTAIR now due in Veracruz Sun 11 Oct, 2 days later". */
  headline: string;
  /** Shipments of the listener's perimeter the update touched. */
  affected: number;
  /** How many of them now need a customer notice. */
  needNotice: number;
  /** The ones that had an open case before the update and have none after it. */
  resolved: ShipmentId[];
  /** The sentence as a whole, for the toast and the live region. */
  text: string;
  /** What "View" applies, when one filter shows the affected shipments. */
  filter: ShipmentFilter | null;
};

/** A hint that something changed. It carries ids, never data: scope is enforced on the refetch. */
export type Change = { shipmentIds: ShipmentId[]; notice: FeedNotice | null };

/** A demo persona and its perimeter in words, for the persona menu. */
export type PersonaView = {
  actor: Actor;
  side: "operations" | "customer";
  /** "All sites, all accounts · 23 shipments". */
  perimeter: string;
};
