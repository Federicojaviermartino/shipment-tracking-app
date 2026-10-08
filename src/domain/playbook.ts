import { assertNever } from "./assert-never";
import type { ShipmentDates } from "./dates";
import { DOCUMENT_LABEL } from "./labels";
import {
  internalEvents,
  noticesSent,
  type ExceptionType,
  type InternalEvent,
  type LoggedEvent,
} from "./log";
import type { Actor } from "./perimeter";
import type { DocumentType, OperatorId, UserId } from "./shipment";
import type { HoldEntry } from "./timeline";
import type { Instant } from "./time";

/**
 * Rules choose the exception and the steps; AI only estimates and writes. Whether a step is done
 * is read from the log every time, so there is no ticket that can disagree with what happened.
 */

export type StepKind = "confirm_reading" | "send_document" | "contact_operator" | "notify_customer";

/** The one place where role differs from perimeter. */
export type Capability = "logistics" | "any_internal";

export type Step = {
  kind: StepKind;
  label: string;
  /** `outdated`: the customer was told a date that is no longer the best one. */
  state: "todo" | "done" | "outdated";
  requires: Capability;
  doneBy?: UserId;
  doneAt?: Instant;
  /** Whom to contact, or whom the document goes to. */
  operatorId?: OperatorId;
  docType?: DocumentType;
  /** The model reading to confirm. */
  eventKey?: string;
};

export type CaseState = "needs_action" | "waiting";

/** What the playbook needs to know about a rule that fires. */
export type OpenCase = {
  type: ExceptionType;
  basis: "declared" | "inferred" | "rule";
  since: Instant;
  hold?: HoldEntry;
  /** The operator responsible for the stretch the cargo is in. */
  operatorId?: OperatorId;
  /** Where documents for customs go. */
  forwarderId?: OperatorId;
  notOnFile?: DocumentType[];
};

type Done = { state: "todo" } | { state: "done" | "outdated"; doneBy: UserId; doneAt: Instant };

const TODO: Done = { state: "todo" };

function doneBy(event: InternalEvent | undefined): Done {
  return event ? { state: "done", doneBy: event.by, doneAt: event.at } : TODO;
}

function latest<E extends InternalEvent>(events: E[]): E | undefined {
  return [...events].sort((a, b) => a.at - b.at).at(-1);
}

function readingConfirmed(events: InternalEvent[], eventKey: string): Done {
  return doneBy(
    latest(events.filter((e) => e.type === "reading_reviewed" && e.eventKey === eventKey)),
  );
}

function documentSent(
  events: InternalEvent[],
  docType: DocumentType,
  to: OperatorId | undefined,
  since: Instant,
): Done {
  return doneBy(
    latest(
      events.filter(
        (e) =>
          e.type === "document_sent" &&
          e.docType === docType &&
          (to === undefined || e.to === to) &&
          e.at >= since,
      ),
    ),
  );
}

function operatorContacted(
  events: InternalEvent[],
  operatorId: OperatorId | undefined,
  since: Instant,
): Done {
  return doneBy(
    latest(
      events.filter(
        (e) =>
          e.type === "operator_contacted" &&
          (operatorId === undefined || e.operatorId === operatorId) &&
          e.at >= since,
      ),
    ),
  );
}

/**
 * Done means: the customer has been told the current best door day. Comparing the day of the
 * latest notice with today's best day needs no history, and it is what keeps a second notice from
 * being proposed when the operator later confirms the date Estela had already communicated.
 */
function customerTold(events: readonly LoggedEvent[], dates: ShipmentDates, since: Instant): Done {
  const last = noticesSent(events).at(-1);
  if (!last) return TODO;
  const told = { doneBy: last.by, doneAt: last.at };
  if (dates.best) {
    return { state: last.published?.day === dates.best.day ? "done" : "outdated", ...told };
  }
  return last.at >= since ? { state: "done", ...told } : TODO;
}

function step(base: Omit<Step, "state" | "doneBy" | "doneAt">, done: Done): Step {
  return { ...base, ...done };
}

/** The ordered steps Estela proposes for a firing rule, each with its state read from the log. */
export function stepsFor(
  open: OpenCase,
  dates: ShipmentDates,
  events: readonly LoggedEvent[],
): Step[] {
  const own = internalEvents(events);
  const notify = step(
    { kind: "notify_customer", label: "Notify the customer", requires: "any_internal" },
    customerTold(events, dates, open.since),
  );
  const contact = (label: string): Step =>
    step(
      {
        kind: "contact_operator",
        label,
        requires: "logistics",
        ...(open.operatorId ? { operatorId: open.operatorId } : {}),
      },
      operatorContacted(own, open.operatorId, open.since),
    );
  const send = (docType: DocumentType, label: string): Step =>
    step(
      {
        kind: "send_document",
        label,
        requires: "logistics",
        docType,
        ...(open.forwarderId ? { operatorId: open.forwarderId } : {}),
      },
      documentSent(own, docType, open.forwarderId, open.since),
    );

  switch (open.type) {
    case "customs_hold": {
      const steps: Step[] = [];
      if (open.hold && open.hold.reading !== "table") {
        steps.push(
          step(
            {
              kind: "confirm_reading",
              label: "Confirm what the AI read in the operator's message",
              requires: "logistics",
              eventKey: open.hold.eventKey,
            },
            readingConfirmed(own, open.hold.eventKey),
          ),
        );
      }
      // Under DAP the consignee's broker clears import: our part is the exporter's document.
      steps.push(
        send("commercial_invoice", "Send the corrected commercial invoice to the broker"),
        notify,
      );
      return steps;
    }
    case "carrier_hold":
      return [contact("Ask the carrier to release what can move and to send photos"), notify];
    case "delay":
      return [notify];
    case "predicted_delay":
      return open.basis === "inferred"
        ? [contact("Ask the operator to confirm before alarming the customer"), notify]
        : [notify];
    case "cutoff_risk":
      return (open.notOnFile ?? []).map((docType) =>
        send(docType, `Send the ${DOCUMENT_LABEL[docType].toLowerCase()} to the forwarder`),
      );
    case "stale":
      return [contact("Ask the operator for position and ETA")];
    default:
      return assertNever(open.type);
  }
}

/** A case needs action while any step is open; once every step is done it waits on the outside world. */
export function caseState(steps: readonly Step[]): CaseState {
  return steps.some((s) => s.state !== "done") ? "needs_action" : "waiting";
}

export function canPerform(actor: Actor, requires: Capability): boolean {
  if (actor.kind !== "internal") return false;
  return requires === "any_internal" || actor.role === "logistics";
}

export const CAPABILITY_REASON: Record<Capability, string> = {
  logistics: "Needs the Logistics role.",
  any_internal: "Only Ibón staff can do this.",
};
