import { toCustomerView } from "@/domain/customer-view";
import type { DocumentStatus } from "@/domain/documents";
import { DESK_ZONE } from "@/domain/filters";
import { DOCUMENT_LABEL, HEALTH_LABEL, MILESTONE_LABEL, STAGE_LABEL } from "@/domain/labels";
import { internalEvents, type LoggedEvent } from "@/domain/log";
import type { InternalActor } from "@/domain/perimeter";
import type { ShipmentProjection } from "@/domain/projection";
import { operatorsOf, type RefKind } from "@/domain/shipment";
import { addDays, localDate } from "@/domain/time";
import type { ReadContext } from "../context";
import { accountOf, shortAccountName, siteOf, sourceName, userName } from "../directory";
import { customerSees, incotermLine } from "../text/customer-text";
import { COUNTRY_NAME } from "../text/filter-text";
import { identityLine } from "../text/perimeter-text";
import { stageDetail } from "../text/status-line";
import type { DocumentView, OpsOverview, OpsRow, OpsShipmentView, SentMessageView } from "../views";
import { caseView } from "./cases";
import { datesView } from "./dates";
import { routeView, type RouteProblem } from "./route";
import { timelineView } from "./timeline";

const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  on_file: "On file",
  missing: "Missing",
  not_yet_due: "Not due yet",
  pending: "Pending",
  sent: "Sent, awaiting acknowledgement",
};

const REFERENCE_LABEL: Record<RefKind, string> = {
  expedition: "Expedition",
  booking: "Booking",
  container: "Container",
  bill_of_lading: "Bill of lading",
  forwarder_file: "Forwarder file",
};

function problemOf(projection: ShipmentProjection): RouteProblem | null {
  const { health, primary } = projection;
  if (health === "on_time" || health === "delivered") return null;
  return { health, on: primary?.type === "cutoff_risk" ? "sailing" : "position" };
}

/** One shipment as a row of the queue or of the portfolio. */
export function opsRow(
  context: ReadContext,
  actor: InternalActor,
  projection: ShipmentProjection,
  events: readonly LoggedEvent[],
): OpsRow {
  const { shipment, timeline, primary } = projection;
  const { directory } = context;
  const account = accountOf(directory, shipment.accountId);
  const site = siteOf(directory, shipment.originSiteId);
  const destination = shipment.consignee.place;
  const origin = site?.place ?? shipment.plan[0]?.place ?? destination;

  return {
    id: shipment.id,
    orderRef: shipment.orderRef,
    account: {
      id: shipment.accountId,
      name: account?.name ?? shipment.accountId,
      type: account?.type ?? "customer",
    },
    origin: {
      siteId: shipment.originSiteId,
      siteName: site?.name ?? shipment.originSiteId,
      place: { name: origin.name, country: origin.country, zone: origin.zone },
    },
    destination: {
      name: shipment.consignee.name,
      place: { name: destination.name, country: destination.country, zone: destination.zone },
    },
    lane: `${origin.name} → ${destination.name}, ${destination.country}`,
    route: routeView(directory, projection, {
      problem: problemOf(projection),
      stale: projection.exceptions.some((exception) => exception.type === "stale"),
    }),
    stage: {
      code: projection.stage,
      label: STAGE_LABEL[projection.stage].ops,
      importGate: projection.importGate?.state ?? null,
      detail: stageDetail(projection),
    },
    health: projection.health,
    healthLabel: HEALTH_LABEL[projection.health],
    case: primary ? caseView(context, actor, projection, primary, events) : null,
    otherCases: Math.max(0, projection.exceptions.length - 1),
    dates: datesView(context, projection),
    lastUpdate: timeline.lastFact
      ? {
          at: timeline.lastFact.receivedAt,
          by: sourceName(directory, timeline.lastFact.source),
        }
      : null,
  };
}

function documentViews(context: ReadContext, projection: ShipmentProjection): DocumentView[] {
  return projection.documents.map((document): DocumentView => {
    const sent = document.status === "sent";
    return {
      docType: document.docType,
      label: DOCUMENT_LABEL[document.docType],
      status: document.status,
      statusLabel: DOCUMENT_STATUS_LABEL[document.status],
      neededFor: document.neededFor
        ? `Needed for ${MILESTONE_LABEL[document.neededFor].toLowerCase()}`
        : null,
      fileName: document.file?.fileName ?? null,
      at: sent ? (document.sentAt ?? null) : (document.file?.at ?? null),
      by: document.file && !sent ? sourceName(context.directory, document.file.source) : null,
      customerVisible: document.file?.customerVisible ?? false,
    };
  });
}

/** What left the building about this shipment, newest first: nothing does without an approver. */
function sentMessages(
  context: ReadContext,
  projection: ShipmentProjection,
  events: readonly LoggedEvent[],
): SentMessageView[] {
  const { directory } = context;
  const account = accountOf(directory, projection.shipment.accountId);
  const customer = account
    ? `${shortAccountName(account.name)} (${account.type})`
    : projection.shipment.accountId;
  return internalEvents(events)
    .flatMap((event): SentMessageView[] => {
      const base = { id: event.id, by: userName(directory, event.by), at: event.at };
      switch (event.type) {
        case "notice_sent":
          return [
            {
              ...base,
              kind: "customer_notice",
              to: customer,
              subject: event.subject,
              body: event.body,
              attachment: null,
              publishedDay: event.published?.day ?? null,
            },
          ];
        case "operator_contacted":
          return [
            {
              ...base,
              kind: "operator_message",
              to: sourceName(directory, event.operatorId),
              subject: event.subject,
              body: event.body,
              attachment: null,
              publishedDay: null,
            },
          ];
        case "document_sent":
          return [
            {
              ...base,
              kind: "document",
              to: sourceName(directory, event.to),
              subject: event.subject,
              body: event.body,
              attachment: event.fileName,
              publishedDay: null,
            },
          ];
        case "reading_reviewed":
          return [];
      }
    })
    .sort((a, b) => b.at - a.at);
}

/** One shipment with everything its page shows. */
export function opsShipment(
  context: ReadContext,
  actor: InternalActor,
  projection: ShipmentProjection,
  events: readonly LoggedEvent[],
): OpsShipmentView {
  const { shipment } = projection;
  const { directory, now } = context;
  const customer = toCustomerView({
    shipment,
    timeline: projection.timeline,
    dates: projection.dates,
    health: projection.health,
    events,
    now,
  });

  return {
    ...opsRow(context, actor, projection, events),
    incotermLine: incotermLine(customer.identifiers.incoterm, "ops"),
    cargo: {
      description: shipment.cargo.description,
      packages: shipment.cargo.packages,
      grossWeightKg: shipment.cargo.grossWeightKg,
      container: shipment.cargo.container ?? null,
    },
    voyage: shipment.voyage ?? null,
    cases: projection.exceptions.map((exception) =>
      caseView(context, actor, projection, exception, events),
    ),
    customerSees: customerSees(directory, customer),
    timeline: timelineView(context, actor, projection, events),
    documents: documentViews(context, projection),
    references: [
      {
        label: "Customer order",
        value: shipment.orderRef,
        holder: accountOf(directory, shipment.accountId)?.name ?? shipment.accountId,
      },
      ...shipment.refs.map((ref) => ({
        label: REFERENCE_LABEL[ref.kind],
        value: ref.value,
        holder: sourceName(directory, ref.operatorId),
      })),
    ],
    messages: sentMessages(context, projection, events),
  };
}

/** The briefing over an actor's perimeter: counted by rules, never by a model. */
export function opsOverview(
  context: ReadContext,
  actor: InternalActor,
  inScope: readonly ShipmentProjection[],
  suggestions: string[],
): OpsOverview {
  const { directory, now } = context;
  const count = (test: (row: ShipmentProjection) => boolean) => inScope.filter(test).length;
  const attention = inScope.filter((row) => row.primary?.state === "needs_action");
  const yesterday = addDays(localDate(now, DESK_ZONE), -1);

  const counts = {
    attention: attention.length,
    waiting: count((row) => row.primary?.state === "waiting"),
    all: inScope.length,
    delayed: count((row) => row.health === "delayed"),
    held: count((row) => row.health === "held"),
    atRisk: count((row) => row.health === "at_risk"),
    stale: count((row) => row.health === "stale"),
    onPlan: count((row) => row.health === "on_time"),
    deliveredSinceYesterday: count(
      (row) => row.dates.delivered !== null && row.dates.delivered.day >= yesterday,
    ),
  };

  // The breakdown covers the cases that need the reader, so that it adds up to the first number.
  const breakdown = (["delayed", "held", "at_risk", "stale"] as const).flatMap((health) => {
    const cases = attention.filter((row) => row.health === health).length;
    return cases > 0 ? [`${cases} ${HEALTH_LABEL[health].toLowerCase()}`] : [];
  });
  const need =
    attention.length > 0
      ? `${attention.length} need${attention.length === 1 ? "s" : ""} you: ${breakdown.join(", ")}.`
      : "Nothing needs you right now.";
  const waiting = counts.waiting > 0 ? ` ${counts.waiting} waiting on others.` : "";
  const line = `${need}${waiting} ${counts.onPlan} on plan. ${counts.deliveredSinceYesterday} delivered since yesterday.`;

  const received = inScope.flatMap((row) => row.timeline.lastFact?.receivedAt ?? []);
  const unique = <Value>(values: Value[]) => [...new Set(values)];
  const shipments = inScope.map((row) => row.shipment);

  return {
    identity: identityLine(directory, actor, inScope.length),
    counts,
    line,
    lastOperatorUpdateAt: received.length > 0 ? Math.max(...received) : null,
    filterOptions: {
      countries: unique(shipments.map((shipment) => shipment.consignee.place.country)).map(
        (code) => ({ code, name: COUNTRY_NAME[code] }),
      ),
      sites: unique(shipments.map((shipment) => shipment.originSiteId)).map((id) => ({
        id,
        name: siteOf(directory, id)?.name ?? id,
      })),
      accounts: unique(shipments.map((shipment) => shipment.accountId)).map((id) => ({
        id,
        name: accountOf(directory, id)?.name ?? id,
      })),
      operators: unique(shipments.flatMap(operatorsOf)).map((id) => ({
        id,
        name: sourceName(directory, id),
      })),
      vessels: unique(shipments.flatMap((shipment) => shipment.voyage?.vessel ?? [])),
    },
    suggestions,
  };
}
