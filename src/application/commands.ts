import { assertNever } from "@/domain/assert-never";
import { DOCUMENT_LABEL } from "@/domain/labels";
import { internalEvents, operatorEvents, type InternalEvent, type LoggedEvent } from "@/domain/log";
import { inScope, type InternalActor } from "@/domain/perimeter";
import { canPerform, CAPABILITY_REASON, REVIEW_REQUIRES, type StepKind } from "@/domain/playbook";
import type { ShipmentProjection } from "@/domain/projection";
import { operatorsOf, type Shipment } from "@/domain/shipment";
import { formatDay } from "@/domain/time";
import type { ReadContext } from "./context";
import { accountOf, shortAccountName, sourceName, type Directory } from "./directory";
import { isDraftable, planDraft } from "./drafting";
import type { CommandResult, OpsCommand } from "./estela";
import type { Clock } from "./ports/clock";
import type { EventStore } from "./ports/event-store";
import type { Projector } from "./projections";
import { permissionFor, roleReason } from "./text/case-text";
import { list } from "./text/format";
import { ungroundedDates } from "./text/grounding";

const NOT_FOUND: CommandResult = { ok: false, reason: "not_found" };
const CASE_CLOSED = "This case is no longer open. Reload the shipment.";
const ESTIMATE_CHANGED = "The estimate changed while this draft was open. Reload the draft.";

const STEP_OF: Record<Exclude<OpsCommand["type"], "confirm_reading">, StepKind> = {
  send_notice: "notify_customer",
  contact_operator: "contact_operator",
  send_document: "send_document",
};

function refuse(reason: "forbidden" | "outdated" | "invalid", message: string): CommandResult {
  return { ok: false, reason, message };
}

/**
 * What a person decides becomes an internal event in the same log the operator feed writes to:
 * there is no other state to update. Scope is checked first and answers "not found"; role comes
 * second and answers with the reason the screen shows.
 */
export function createCommands(deps: {
  directory: Directory;
  store: EventStore;
  clock: Clock;
  projector: Projector;
}): (actor: InternalActor, command: OpsCommand) => Promise<CommandResult> {
  const { directory, store, clock, projector } = deps;

  /** Unique in the log, and the same in every tab that reads it back. */
  const nextId = (type: InternalEvent["type"], shipmentId: string, at: number) =>
    `${type}:${shipmentId}:${at}:${internalEvents(store.events()).length + 1}`;

  function confirmReading(
    actor: InternalActor,
    command: Extract<OpsCommand, { type: "confirm_reading" }>,
    context: ReadContext,
    shipment: Shipment,
    events: readonly LoggedEvent[],
  ): CommandResult {
    if (!canPerform(actor, REVIEW_REQUIRES)) {
      return refuse("forbidden", roleReason(context, shipment, REVIEW_REQUIRES));
    }
    const reading = operatorEvents(events).find(
      (event) => event.key === command.eventKey && event.reading.method === "ai",
    );
    if (!reading) return refuse("invalid", "There is no AI reading with that key to review.");

    const at = clock.now();
    store.append({
      events: [
        {
          kind: "internal",
          type: "reading_reviewed",
          id: nextId("reading_reviewed", command.shipmentId, at),
          shipmentId: command.shipmentId,
          at,
          by: actor.userId,
          eventKey: command.eventKey,
          accepted: command.accepted,
        },
      ],
    });
    return {
      ok: true,
      message: command.accepted
        ? "Reading confirmed. It now counts as a fact."
        : "Reading rejected. The message stays in the timeline as a note.",
    };
  }

  function outbound(
    actor: InternalActor,
    command: Exclude<OpsCommand, { type: "confirm_reading" }>,
    context: ReadContext,
    projection: ShipmentProjection,
    events: readonly LoggedEvent[],
  ): CommandResult {
    const { shipment, dates } = projection;
    const exception = projection.exceptions.find((open) => open.type === command.exception);
    if (!exception) return refuse("outdated", CASE_CLOSED);
    const kind = STEP_OF[command.type];
    const step = exception.steps.find(
      (candidate) =>
        candidate.kind === kind &&
        (command.type !== "send_document" || candidate.docType === command.docType),
    );
    if (!step) return refuse("invalid", "The case has no such step.");

    const permission = permissionFor(context, actor, shipment, exception, step);
    if (permission.why === "role") {
      return refuse("forbidden", permission.disabledReason ?? CAPABILITY_REASON[step.requires]);
    }
    if (permission.why === "reading") {
      return refuse("invalid", permission.disabledReason ?? "");
    }
    if (!command.subject.trim() || !command.body.trim()) {
      return refuse("invalid", "A message needs a subject and a body.");
    }

    const at = clock.now();
    const base = {
      kind: "internal" as const,
      id: nextId(eventType(command), shipment.id, at),
      shipmentId: shipment.id,
      at,
      by: actor.userId,
      exception: exception.type,
      subject: command.subject,
      body: command.body,
    };

    switch (command.type) {
      case "send_notice": {
        if ((dates.best?.day ?? null) !== command.expectedDay) {
          return refuse("outdated", ESTIMATE_CHANGED);
        }
        if (!isDraftable(step)) return refuse("invalid", "The case has no such step.");
        const plan = planDraft(context, actor, projection, exception, step, events);
        const invented = ungroundedDates(`${command.subject}\n${command.body}`, plan.lines);
        if (invented.length > 0) {
          return refuse(
            "invalid",
            `${invented.length === 1 ? "This date is" : "These dates are"} not in the shipment record: ${list(invented)}.`,
          );
        }
        // The date the customer will read is taken from the record, never from the wording.
        store.append({ events: [{ ...base, type: "notice_sent", published: dates.best }] });
        const account = accountOf(directory, shipment.accountId);
        const customer = account ? shortAccountName(account.name) : "The customer";
        const published = plan.frame.changes?.to.published;
        const sees =
          published && published.kind !== "under_review"
            ? formatDay(published.day)
            : "the delivery date as under review";
        return { ok: true, message: `Notice sent. ${customer} now sees ${sees}.` };
      }
      case "contact_operator": {
        if (!operatorsOf(shipment).includes(command.operatorId)) {
          return refuse("invalid", "That operator has no part in this shipment.");
        }
        store.append({
          events: [{ ...base, type: "operator_contacted", operatorId: command.operatorId }],
        });
        return {
          ok: true,
          message: `Message sent to ${sourceName(directory, command.operatorId)}.`,
        };
      }
      case "send_document": {
        const to = step.operatorId;
        if (!to) return refuse("invalid", "Nobody is on file to receive this document.");
        if (!command.fileName.trim()) return refuse("invalid", "Attach a file first.");
        store.append({
          events: [
            {
              ...base,
              type: "document_sent",
              docType: command.docType,
              fileName: command.fileName.trim(),
              to,
            },
          ],
        });
        return {
          ok: true,
          message: `${DOCUMENT_LABEL[command.docType]} sent to ${sourceName(directory, to)}.`,
        };
      }
      default:
        return assertNever(command);
    }
  }

  return async (actor, command) => {
    const world = await projector.current();
    const projection = world.byId.get(command.shipmentId);
    if (!projection || !inScope(actor, projection.shipment)) return NOT_FOUND;
    const events = world.eventsOf.get(command.shipmentId) ?? [];
    const context: ReadContext = { directory, now: world.now, rawOf: (id) => store.raw(id) };
    return command.type === "confirm_reading"
      ? confirmReading(actor, command, context, projection.shipment, events)
      : outbound(actor, command, context, projection, events);
  };
}

function eventType(
  command: Exclude<OpsCommand, { type: "confirm_reading" }>,
): InternalEvent["type"] {
  switch (command.type) {
    case "send_notice":
      return "notice_sent";
    case "contact_operator":
      return "operator_contacted";
    case "send_document":
      return "document_sent";
    default:
      return assertNever(command);
  }
}
