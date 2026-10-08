import type { ShipmentException } from "@/domain/exceptions";
import { HOLD_LABEL } from "@/domain/labels";
import { operatorEvents, type LoggedEvent } from "@/domain/log";
import type { InternalActor } from "@/domain/perimeter";
import type { Step } from "@/domain/playbook";
import type { ShipmentProjection } from "@/domain/projection";
import { openHolds } from "@/domain/timeline";
import type { ReadContext } from "../context";
import { sourceName, userName } from "../directory";
import {
  caseTitle,
  clockOf,
  permissionFor,
  stepText,
  waitingLine,
  whyLine,
} from "../text/case-text";
import type { CaseView, EvidenceView, ReadingView, StepView } from "../views";
import { entryIdsByEventKey, rawMessageView, reviewersOf } from "./timeline";

function stepView(
  context: ReadContext,
  actor: InternalActor,
  projection: ShipmentProjection,
  exception: ShipmentException,
  step: Step,
): StepView {
  const { allowed, disabledReason } = permissionFor(
    context,
    actor,
    projection.shipment,
    exception,
    step,
  );
  return {
    kind: step.kind,
    ...stepText(context, projection, exception, step),
    state: step.state,
    allowed,
    disabledReason,
    done:
      step.doneBy !== undefined && step.doneAt !== undefined
        ? { by: userName(context.directory, step.doneBy), at: step.doneAt }
        : null,
    operator: step.operatorId
      ? { id: step.operatorId, name: sourceName(context.directory, step.operatorId) }
      : null,
    docType: step.docType ?? null,
    eventKey: step.eventKey ?? null,
  };
}

function readingView(
  context: ReadContext,
  projection: ShipmentProjection,
  exception: ShipmentException,
  reviewers: ReadonlyMap<string, string>,
): ReadingView | null {
  if (exception.type !== "customs_hold" && exception.type !== "carrier_hold") return null;
  const kind = exception.type === "customs_hold" ? "customs" : "carrier";
  const hold = openHolds(projection.timeline).find((candidate) => candidate.hold === kind);
  if (!hold || hold.reading === "table") return null;
  return {
    eventKey: hold.eventKey,
    state: hold.reading,
    text: `${HOLD_LABEL[hold.hold].ops}: ${hold.reason}`,
    source: sourceName(context.directory, hold.raised.provenance.source),
    reviewedBy: reviewers.get(hold.eventKey) ?? null,
    original: rawMessageView(context, hold.raised.provenance.rawId),
  };
}

/** One open exception as a desk works it: the reason, the clock, the evidence and the steps. */
export function caseView(
  context: ReadContext,
  actor: InternalActor,
  projection: ShipmentProjection,
  exception: ShipmentException,
  events: readonly LoggedEvent[],
): CaseView {
  const entryIds = entryIdsByEventKey(projection.timeline);
  const received = new Map(operatorEvents(events).map((event) => [event.key, event.receivedAt]));
  const steps = exception.steps.map((step) =>
    stepView(context, actor, projection, exception, step),
  );

  const evidence = exception.evidence.map((line): EvidenceView => {
    const { provenance } = line;
    const key = line.eventKeys[0];
    return {
      text: line.text,
      provenance: provenance.kind,
      confirmed: provenance.kind === "ai_reading" ? provenance.confirmed : true,
      source: "source" in provenance ? sourceName(context.directory, provenance.source) : null,
      receivedAt: key ? (received.get(key) ?? null) : null,
      entryId: key ? (entryIds.get(key) ?? null) : null,
    };
  });

  return {
    id: exception.id,
    type: exception.type,
    health: exception.health,
    basis: exception.basis,
    state: exception.state,
    primary: projection.primary?.id === exception.id,
    needsConfirmation: exception.needsConfirmation === true,
    title: caseTitle(context, projection, exception),
    why: whyLine(context, projection, exception),
    clock: clockOf(projection.shipment, exception, context.now),
    nextStep: steps.find((step) => step.state !== "done") ?? null,
    steps,
    evidence,
    waiting: waitingLine(exception),
    reading: readingView(context, projection, exception, reviewersOf(context, events)),
  };
}
