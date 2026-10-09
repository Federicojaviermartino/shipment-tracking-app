import type { DemoEventStatus, DemoFeed, LogView } from "@/application/ports/demo-feed";
import { assertNever } from "@/domain/assert-never";
import { DOCUMENT_LABEL } from "@/domain/labels";
import { internalEvents, type RawMessage } from "@/domain/log";
import type { DocumentType, ShipmentId } from "@/domain/shipment";
import type { Instant } from "@/domain/time";

/** What must already be in the log for an event to make sense. */
export type ScriptPrecondition =
  | { kind: "none" }
  | { kind: "demo_event_sent"; id: string }
  | { kind: "document_sent"; shipmentId: ShipmentId; docType: DocumentType };

export type ScriptedEvent = {
  id: string;
  label: string;
  precondition: ScriptPrecondition;
  /** The ids its raw messages carry whenever they are sent: how "sent" is read from the log. */
  messageIds: readonly string[];
  messages(now: Instant): RawMessage[];
};

/** "Noray Lines · NORAY ALTAIR delayed at Veracruz" is called by what it sends. */
function shortLabel(label: string): string {
  return label.split(" · ").at(-1) ?? label;
}

/**
 * The scripted operator feed. There is no timer: one event is sent at a time, on request, and a
 * precondition keeps an event back until the log shows what it needs.
 */
export class ScriptedDemoFeed implements DemoFeed {
  constructor(private readonly script: readonly ScriptedEvent[]) {}

  events(log: LogView): DemoEventStatus[] {
    const sent = (event: ScriptedEvent) =>
      event.messageIds.length > 0 && event.messageIds.every((id) => log.received(id));

    const blockedBy = (precondition: ScriptPrecondition): string | null => {
      switch (precondition.kind) {
        case "none":
          return null;
        case "demo_event_sent": {
          const required = this.script.find((event) => event.id === precondition.id);
          if (!required || sent(required)) return null;
          return `Send "${shortLabel(required.label)}" first`;
        }
        case "document_sent": {
          const done = internalEvents(log.events()).some(
            (event) =>
              event.type === "document_sent" &&
              event.shipmentId === precondition.shipmentId &&
              event.docType === precondition.docType,
          );
          if (done) return null;
          const document = DOCUMENT_LABEL[precondition.docType].toLowerCase();
          return `Send the ${document} for ${precondition.shipmentId} first`;
        }
        default:
          return assertNever(precondition);
      }
    };

    return this.script.map((event): DemoEventStatus => {
      if (sent(event)) return { id: event.id, label: event.label, state: "sent" };
      const reason = blockedBy(event.precondition);
      return reason === null
        ? { id: event.id, label: event.label, state: "ready" }
        : { id: event.id, label: event.label, state: "blocked", reason };
    });
  }

  messages(id: string, now: Instant): RawMessage[] {
    return this.script.find((event) => event.id === id)?.messages(now) ?? [];
  }
}
