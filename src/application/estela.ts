import type { ShipmentFilter } from "@/domain/filters";
import type { ExceptionType } from "@/domain/log";
import type { Actor, ExternalActor, InternalActor } from "@/domain/perimeter";
import type { StepKind } from "@/domain/playbook";
import type { DocumentType, OperatorId, ShipmentId } from "@/domain/shipment";
import type { Instant, LocalDate } from "@/domain/time";
import type { DemoEventStatus } from "./ports/demo-feed";
import type { Unsubscribe } from "./ports/event-store";
import type {
  AskResult,
  Change,
  DigestHighlight,
  Draft,
  FilterChip,
  OpsOverview,
  OpsRow,
  OpsShipmentView,
  PersonaView,
  PortalHome,
  PortalShipmentView,
} from "./views";

/** `attention`: cases that need the reader. `waiting`: their part is done. `all`: the portfolio. */
export type QueueView = "attention" | "waiting" | "all";

/** Whatever a person decides to do about a case. Each one ends up as an event in the log. */
export type OpsCommand =
  | { type: "confirm_reading"; shipmentId: ShipmentId; eventKey: string; accepted: boolean }
  | {
      type: "send_notice";
      shipmentId: ShipmentId;
      exception: ExceptionType;
      subject: string;
      body: string;
      /**
       * The door day the approver was shown (`Draft.publishes`). The date a notice publishes is
       * taken from the record at the moment of sending; if it is no longer this day, the notice
       * is refused as outdated instead of publishing a date its text does not mention.
       */
      expectedDay: LocalDate | null;
    }
  | {
      type: "contact_operator";
      shipmentId: ShipmentId;
      exception: ExceptionType;
      operatorId: OperatorId;
      subject: string;
      body: string;
    }
  | {
      type: "send_document";
      shipmentId: ShipmentId;
      exception: ExceptionType;
      docType: DocumentType;
      fileName: string;
      subject: string;
      body: string;
    };

export type CommandResult =
  /** `message` is what the confirmation toast says. */
  | { ok: true; message: string }
  /** Unknown and out of perimeter are the same answer: existence never leaks. */
  | { ok: false; reason: "not_found" }
  /**
   * `forbidden`: the actor's role may not do this. `outdated`: the case or its date changed
   * while the draft was open. `invalid`: the command cannot be carried out as written.
   */
  | { ok: false; reason: "forbidden" | "outdated" | "invalid"; message: string };

/**
 * The only thing the UI calls. Every query and every command applies the perimeter policy before
 * anything else, so no component ever filters, and nothing is returned that the actor may not see.
 */
export interface Estela {
  /** The demo clock: screens read time from here, never from the browser. */
  now(): Instant;
  actors(): Actor[];

  ops: {
    /** The briefing: computed counts, the identity line and the vocabulary of the perimeter. */
    overview(actor: InternalActor): Promise<OpsOverview>;
    /** The one generated sentence of the briefing, apart, so that counts never wait on a model. */
    highlight(actor: InternalActor): Promise<DigestHighlight | null>;
    shipments(
      actor: InternalActor,
      query: { view: QueueView; filter?: ShipmentFilter },
    ): Promise<OpsRow[]>;
    shipment(actor: InternalActor, id: ShipmentId): Promise<OpsShipmentView | null>;
    ask(actor: InternalActor, text: string): Promise<AskResult>;
    /** A filter as chips with resolved values, for a filter that came from the URL. */
    describeFilter(actor: InternalActor, filter: ShipmentFilter): FilterChip[];
    /** `null` when the shipment is not found or has no open step of that kind to draft for. */
    draft(actor: InternalActor, shipmentId: ShipmentId, step: StepKind): Promise<Draft | null>;
    execute(actor: InternalActor, command: OpsCommand): Promise<CommandResult>;
  };

  portal: {
    home(actor: ExternalActor): Promise<PortalHome>;
    shipment(actor: ExternalActor, id: ShipmentId): Promise<PortalShipmentView | null>;
  };

  /**
   * Hints that something in the actor's perimeter changed, from this tab or another one. A change
   * outside the perimeter is never delivered, and a feed notice only reaches internal actors.
   */
  subscribe(actor: Actor, listener: (change: Change) => void): Unsubscribe;

  /** Tooling of the demo bar: outside the product, so outside any perimeter. */
  demo: {
    personas(): PersonaView[];
    events(): DemoEventStatus[];
    /** Sends a scripted operator event through ingestion. Does nothing unless it is `ready`. */
    send(id: string): Promise<void>;
    /** Back to the seed, here and in every tab. */
    reset(): void;
    /** Fires after any change of the log: the state of the scripted events may have changed. */
    subscribe(listener: () => void): Unsubscribe;
  };
}
