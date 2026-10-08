import { toCustomerView, type CustomerStamp, type CustomerView } from "@/domain/customer-view";
import { DESK_ZONE } from "@/domain/filters";
import { DOCUMENT_LABEL, HOLD_LABEL, MILESTONE_LABEL, STAGE_LABEL } from "@/domain/labels";
import type { LoggedEvent } from "@/domain/log";
import type { ShipmentProjection } from "@/domain/projection";
import { addDays, formatStamp, localDate } from "@/domain/time";
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
import { routeView, type RouteProblem } from "./route";

/** How long a delivered shipment stays on the customer's home page. */
const DELIVERED_DAYS_SHOWN = 30;

const STAMP_WORD: Record<CustomerStamp["kind"], string> = {
  confirmed: "Confirmed",
  estimated: "Estimated",
  planned: "Planned",
};

/** A shipment as its customer may see it: the narrow projection, and the full one it came from. */
export type CustomerItem = { projection: ShipmentProjection; view: CustomerView };

export function customerItem(
  projection: ShipmentProjection,
  events: readonly LoggedEvent[],
  now: number,
): CustomerItem {
  const view = toCustomerView({
    shipment: projection.shipment,
    timeline: projection.timeline,
    dates: projection.dates,
    health: projection.health,
    events,
    now,
  });
  return { projection, view };
}

/** Only what the customer was told is drawn on their route: a confirmed hold or a published delay. */
function problemOf(view: CustomerView): RouteProblem | null {
  if (view.verdict === "on_hold") return { health: "held", on: "position" };
  if (view.verdict === "delayed") return { health: "delayed", on: "position" };
  return null;
}

function noticeViews(context: ReadContext, { view }: CustomerItem): PortalNoticeView[] {
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

export function portalCard(context: ReadContext, item: CustomerItem): PortalCard {
  const { projection, view } = item;
  return {
    id: view.shipmentId,
    orderRef: view.orderRef,
    cargo: `${view.cargo.packages} · ${view.cargo.description}`,
    destination: view.consignee.place.name,
    route: routeView(context.directory, projection, { problem: problemOf(view), stale: false }),
    stage: { code: view.stage, label: STAGE_LABEL[view.stage].customer },
    verdict: view.verdict,
    verdictLabel: verdictLabel(view),
    published: publishedView(context.directory, view.published, view.zone),
    lastUpdateAt: view.lastUpdateAt,
  };
}

export function portalShipment(context: ReadContext, item: CustomerItem): PortalShipmentView {
  const { projection, view } = item;
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
    ...portalCard(context, item),
    consignee: view.consignee.name,
    committed: view.committed,
    zone: view.zone,
    difference: differenceLine(view.committed, view.published),
    reason: view.reason?.text ?? null,
    notices: noticeViews(context, item),
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
    incotermLine: incotermLine(projection.shipment, "customer"),
  };
}

/** The customer's home: a computed sentence, what they were told, and their shipments in three groups. */
export function portalHome(
  context: ReadContext,
  accountId: string,
  items: readonly CustomerItem[],
): PortalHome {
  const since = addDays(localDate(context.now, DESK_ZONE), -DELIVERED_DAYS_SHOWN);
  const byCommitted = (a: CustomerItem, b: CustomerItem) =>
    a.view.committed < b.view.committed ? -1 : a.view.committed > b.view.committed ? 1 : 0;

  const active = items.filter(({ view }) => view.verdict !== "delivered").sort(byCommitted);
  const attention = active.filter(
    ({ view }) => view.verdict === "delayed" || view.verdict === "on_hold",
  );
  const onTheWay = active.filter((item) => !attention.includes(item));
  const delivered = items
    .filter(
      ({ view }) =>
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
    notices: active.flatMap((item) => noticeViews(context, item)).sort((a, b) => b.at - a.at),
    attention: attention.map((item) => portalCard(context, item)),
    onTheWay: onTheWay.map((item) => portalCard(context, item)),
    delivered: delivered.map((item) => portalCard(context, item)),
  };
}
