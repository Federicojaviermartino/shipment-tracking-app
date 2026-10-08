import { toCustomerView } from "@/domain/customer-view";
import { selectDates } from "@/domain/dates";
import { detectExceptions, healthOf, type ShipmentException } from "@/domain/exceptions";
import { DOCUMENT_LABEL } from "@/domain/labels";
import type { LoggedEvent, NoticeSent } from "@/domain/log";
import type { InternalActor } from "@/domain/perimeter";
import type { Step } from "@/domain/playbook";
import type { ShipmentProjection } from "@/domain/projection";
import type { OperatorId } from "@/domain/shipment";
import type { ReadContext } from "./context";
import { accountOf, operatorOf, shortAccountName, sourceName } from "./directory";
import { collectFacts, factLines, type FactSheetLine } from "./fact-sheet";
import type { DraftRequest } from "./ports/message-drafter";
import { customerSees } from "./text/customer-text";
import type { Draft } from "./views";

type DraftStep = Draft["step"];

/** Confirming a reading is a decision, not a message: there is nothing to draft for it. */
export function isDraftable(step: Step): step is Step & { kind: DraftStep } {
  return step.kind !== "confirm_reading";
}

/** Everything about a draft except its words: what the drafter is given and what the reader sees. */
export type DraftPlan = {
  request: DraftRequest;
  lines: FactSheetLine[];
  frame: Omit<Draft, "subject" | "body" | "writtenByAi" | "facts">;
};

function operatorReference(
  context: ReadContext,
  projection: ShipmentProjection,
  operatorId: OperatorId | null,
): string | null {
  const { shipment } = projection;
  const reference = shipment.refs.find((ref) => ref.operatorId === operatorId)?.value;
  if (!reference || !operatorId) return null;
  // A forwarder files by its own number and by the customer's order.
  const forwarder = operatorOf(context.directory, operatorId)?.kind === "forwarder";
  return forwarder ? `${reference} / OC ${shipment.orderRef}` : reference;
}

/**
 * What the customer sees now and what they will see once a notice is approved. It is worked out
 * by running the same projections over the log plus the notice, so the preview cannot disagree
 * with what sending will do.
 */
function approvalPreview(
  context: ReadContext,
  actor: InternalActor,
  projection: ShipmentProjection,
  exception: ShipmentException,
  events: readonly LoggedEvent[],
): NonNullable<Draft["changes"]> {
  const { shipment, timeline, dates } = projection;
  const { now, directory } = context;
  const notice: NoticeSent = {
    kind: "internal",
    type: "notice_sent",
    id: "preview",
    shipmentId: shipment.id,
    at: now,
    by: actor.userId,
    exception: exception.type,
    subject: "",
    body: "",
    published: dates.best,
  };
  const after = [...events, notice];
  const datesAfter = selectDates(shipment, timeline, dates.estela, after, now);
  const healthAfter = healthOf(
    timeline,
    detectExceptions(shipment, timeline, datesAfter, after, now),
  );
  const view = (when: {
    dates: typeof dates;
    health: ShipmentProjection["health"];
    events: readonly LoggedEvent[];
  }) => customerSees(directory, toCustomerView({ shipment, timeline, now, ...when }));
  return {
    from: view({ dates, health: projection.health, events }),
    to: view({ dates: datesAfter, health: healthAfter, events: after }),
  };
}

/** The sheet, the request and the frame of a draft for one step of one case. */
export function planDraft(
  context: ReadContext,
  actor: InternalActor,
  projection: ShipmentProjection,
  exception: ShipmentException,
  step: Step & { kind: DraftStep },
  events: readonly LoggedEvent[],
): DraftPlan {
  const { shipment } = projection;
  const { directory, now } = context;
  const audience = step.kind === "notify_customer" ? "customer" : "operator";
  const operatorId = step.operatorId ?? null;
  const operatorName = operatorId ? sourceName(directory, operatorId) : "the operator";
  const account = accountOf(directory, shipment.accountId);
  const customer = account ? shortAccountName(account.name) : shipment.accountId;
  const { facts, heldReading } = collectFacts(context, projection, exception, step, events);

  const request: DraftRequest = {
    audience,
    step: step.kind,
    exception: exception.type,
    basis: exception.basis,
    now,
    shipment: {
      id: shipment.id,
      orderRef: shipment.orderRef,
      destination: shipment.consignee.place.name,
      zone: projection.dates.zone,
      packages: shipment.cargo.packages,
      vessel: shipment.voyage ? `${shipment.voyage.vessel} ${shipment.voyage.voyage}` : null,
      container: shipment.cargo.container?.number ?? null,
      consigneeClearsImport: shipment.sections.some(
        (section) => section.kind === "port" && section.gate === "import",
      ),
    },
    recipient:
      audience === "customer"
        ? { name: customer, reference: null }
        : { name: operatorName, reference: operatorReference(context, projection, operatorId) },
    facts,
  };

  const titles: Record<DraftStep, string> = {
    notify_customer: "Customer notice",
    contact_operator: `Message to ${operatorName}`,
    send_document: `Send document to ${operatorName}`,
  };
  const notice = step.kind === "notify_customer";

  return {
    request,
    lines: factLines(facts, heldReading),
    frame: {
      shipmentId: shipment.id,
      step: step.kind,
      exception: exception.type,
      audience,
      title: titles[step.kind],
      to:
        audience === "customer"
          ? { name: customer, channel: "Portal alert and email" }
          : { name: operatorName, channel: "Operations desk, by email" },
      attachment:
        step.kind === "send_document" && facts.document
          ? {
              docType: facts.document.docType,
              label: DOCUMENT_LABEL[facts.document.docType],
              suggestedFileName: facts.document.fileName,
            }
          : null,
      operatorId,
      publishes: notice ? projection.dates.best : null,
      changes: notice ? approvalPreview(context, actor, projection, exception, events) : null,
    },
  };
}
