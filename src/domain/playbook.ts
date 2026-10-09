import { assertNever } from "./assert-never";
import type { ShipmentDates } from "./dates";
import {
  internalEvents,
  latestReviews,
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

/** Who may decide whether a model read an operator's message right. */
export const REVIEW_REQUIRES: Capability = "logistics";

export type Step = {
  kind: StepKind;
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
    { kind: "notify_customer", requires: "any_internal" },
    customerTold(events, dates, open.since),
  );
  const contact = (operatorId = open.operatorId): Step =>
    step(
      {
        kind: "contact_operator",
        requires: "logistics",
        ...(operatorId ? { operatorId } : {}),
      },
      operatorContacted(own, operatorId, open.since),
    );
  const send = (docType: DocumentType): Step =>
    step(
      {
        kind: "send_document",
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
              requires: REVIEW_REQUIRES,
              eventKey: open.hold.eventKey,
            },
            doneBy(latestReviews(events).get(open.hold.eventKey)),
          ),
        );
      }
      // Under DAP the consignee's broker clears import: our part is the exporter's document,
      // when the hold says which one customs wants. A hold that names none is not assumed to be
      // about the invoice: the forwarder is asked what customs needs.
      const wanted = open.hold?.requires;
      steps.push(wanted ? send(wanted) : contact(open.forwarderId ?? open.operatorId), notify);
      return steps;
    }
    case "carrier_hold":
      return [contact(), notify];
    case "delay":
      return [notify];
    case "predicted_delay":
      return open.basis === "inferred" ? [contact(), notify] : [notify];
    case "cutoff_risk":
      return (open.notOnFile ?? []).map((docType) => send(docType));
    case "stale":
      return [contact()];
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
