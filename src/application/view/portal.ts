import { toCustomerView, type CustomerStamp, type CustomerView } from "@/domain/customer-view";
import { DESK_ZONE } from "@/domain/filters";
import { DOCUMENT_LABEL, HOLD_LABEL, MILESTONE_LABEL, STAGE_LABEL } from "@/domain/labels";
import type { LoggedEvent } from "@/domain/log";
import type { ShipmentProjection } from "@/domain/projection";
import { addDays, formatStamp, localDate, type Instant } from "@/domain/time";
import type { ReadContext } from "../context";
import { accountOf, userName } from "../directory";
import {
  differenceLine,
  incotermLine,
  portalSummary,
  publishedView,
  verdictLabel,
} from "../text/customer-text";
import type { PortalCard, PortalHome, PortalNoticeView, PortalShipmentView } from "../views";
import { customerRouteView, type RouteProblem } from "./route";

/** How long a delivered shipment stays on the customer's home page. */
const DELIVERED_DAYS_SHOWN = 30;

const STAMP_WORD: Record<CustomerStamp["kind"], string> = {
  confirmed: "Confirmed",
  estimated: "Estimated",
  planned: "Planned",
};

/**
 * A shipment as its customer may see it. This is the last place where the full projection is in
 * reach: every builder below takes the narrow view, so nothing it lacks can end up on a page.
 */
export function customerView(
  projection: ShipmentProjection,
  events: readonly LoggedEvent[],
  now: Instant,
): CustomerView {
  return toCustomerView({
    shipment: projection.shipment,
    timeline: projection.timeline,
    dates: projection.dates,
    health: projection.health,
    events,
    now,
  });
}

/** Only what the customer was told is drawn on their route: a confirmed hold or a published delay. */
function problemOf(view: CustomerView): RouteProblem | null {
  if (view.verdict === "on_hold") return { health: "held", on: "position" };
  if (view.verdict === "delayed") return { health: "delayed", on: "position" };
  return null;
}

function noticeViews(context: ReadContext, view: CustomerView): PortalNoticeView[] {
  return view.notices.map((notice) => ({
    id: notice.id,
    shipmentId: view.shipmentId,
    orderRef: view.orderRef,
    at: notice.at,
    approvedBy: userName(context.directory, notice.approvedBy),
    subject: notice.subject,
    body: notice.body,
    verdict: view.verdict,
  }));
}

export function portalCard(context: ReadContext, view: CustomerView): PortalCard {
  return {
    id: view.shipmentId,
    orderRef: view.orderRef,
    cargo: `${view.cargo.packages} · ${view.cargo.description}`,
    destination: view.consignee.place.name,
    route: customerRouteView(context.directory, view, problemOf(view)),
    stage: { code: view.stage, label: STAGE_LABEL[view.stage].customer },
    verdict: view.verdict,
    verdictLabel: verdictLabel(view),
    published: publishedView(context.directory, view.published, view.zone),
    lastUpdateAt: view.lastUpdateAt,
  };
}

export function portalShipment(context: ReadContext, view: CustomerView): PortalShipmentView {
  const { identifiers } = view;
  const references: PortalShipmentView["references"] = [
    { label: "Your order", value: view.orderRef },
  ];
  if (identifiers.container) references.push({ label: "Container", value: identifiers.container });
  if (identifiers.billOfLading) {
    references.push({ label: "Bill of lading", value: identifiers.billOfLading });
  }
  if (identifiers.vessel) {
    references.push({
      label: "Vessel and voyage",
      value: `${identifiers.vessel} ${identifiers.voyage ?? ""}`.trim(),
    });
  }
  if (identifiers.portEta) {
    const { place, when } = identifiers.portEta;
    references.push({
      label: "Port of arrival",
      value: `${place.name} · ${formatStamp(when.at, when.precision, place.zone)} · ${STAMP_WORD[when.kind]}`,
    });
  }

  return {
    ...portalCard(context, view),
    consignee: view.consignee.name,
    committed: view.committed,
    zone: view.zone,
    difference: differenceLine(view.committed, view.published),
    reason: view.reason?.text ?? null,
    notices: noticeViews(context, view),
    milestones: view.milestones.map((milestone) => ({
      key: milestone.key,
      code: milestone.code,
      label: MILESTONE_LABEL[milestone.code],
      place: milestone.place,
      state: milestone.state,
      when: milestone.when ? { ...milestone.when, zone: milestone.place.zone } : null,
    })),
    holds: view.holds.map((hold) => ({
      hold: hold.hold,
      label: HOLD_LABEL[hold.hold].customer,
      since: hold.since,
    })),
    documents: view.documents.map((document) => ({
      docType: document.docType,
      label: DOCUMENT_LABEL[document.docType],
      fileName: document.fileName,
      at: document.at,
    })),
    references,
    incotermLine: incotermLine(identifiers.incoterm, "customer"),
  };
}

/** The customer's home: a computed sentence, what they were told, and their shipments in three groups. */
export function portalHome(
  context: ReadContext,
  accountId: string,
  views: readonly CustomerView[],
): PortalHome {
  const since = addDays(localDate(context.now, DESK_ZONE), -DELIVERED_DAYS_SHOWN);
  const byCommitted = (a: CustomerView, b: CustomerView) =>
    a.committed < b.committed ? -1 : a.committed > b.committed ? 1 : 0;

  const active = views.filter((view) => view.verdict !== "delivered").sort(byCommitted);
  const attention = active.filter(
    (view) => view.verdict === "delayed" || view.verdict === "on_hold",
  );
  const onTheWay = active.filter((view) => !attention.includes(view));
  const delivered = views
    .filter(
      (view) =>
        view.published.kind === "confirmed" &&
        view.verdict === "delivered" &&
        view.published.day >= since,
    )
    .sort((a, b) => byCommitted(b, a));

  const counts = {
    onTheWay: active.length,
    needAttention: attention.length,
    delivered: delivered.length,
  };
  return {
    account: { id: accountId, name: accountOf(context.directory, accountId)?.name ?? accountId },
    counts,
    summary: portalSummary(counts),
    notices: active.flatMap((view) => noticeViews(context, view)).sort((a, b) => b.at - a.at),
    attention: attention.map((view) => portalCard(context, view)),
    onTheWay: onTheWay.map((view) => portalCard(context, view)),
    delivered: delivered.map((view) => portalCard(context, view)),
  };
}
