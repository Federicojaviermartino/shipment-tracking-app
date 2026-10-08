import { assertNever } from "@/domain/assert-never";
import type { CustomerPublished, CustomerView } from "@/domain/customer-view";
import { HOLD_LABEL, STAGE_LABEL } from "@/domain/labels";
import type { Shipment } from "@/domain/shipment";
import { diffDays, formatDay, type LocalDate, type Zone } from "@/domain/time";
import { userName, type Directory } from "../directory";
import type { CustomerSeesView, PublishedView } from "../views";
import { days, plural } from "./format";

/**
 * The words a customer reads. Fixed wording for facts, no operator text, and no claim that the
 * record cannot back: a shipment that is neither late nor provably on time is called by where it
 * is, not by a verdict.
 */

export function verdictLabel(view: Pick<CustomerView, "verdict" | "hold" | "stage">): string {
  switch (view.verdict) {
    case "delivered":
      return "Delivered";
    case "on_hold":
      return view.hold ? HOLD_LABEL[view.hold].customer : "On hold";
    case "delayed":
      return "Delayed";
    case "on_time":
      return "On time";
    case "in_progress":
      return STAGE_LABEL[view.stage].customer;
    default:
      return assertNever(view.verdict);
  }
}

/** The manufacturer's logistics desk, as a customer knows it: "Ibón logistics". */
function desk(directory: Directory): string {
  return `${directory.manufacturer.split(" ")[0]} logistics`;
}

export function publishedView(
  directory: Directory,
  published: CustomerPublished,
  zone: Zone,
): PublishedView {
  switch (published.kind) {
    case "confirmed":
    case "planned":
      return {
        kind: published.kind,
        day: published.day,
        when: { at: published.at, precision: published.precision, zone },
        line: published.kind === "confirmed" ? "Confirmed" : "Planned",
      };
    case "estimated": {
      const when = { at: published.at, precision: published.precision, zone };
      if (published.by.kind === "carrier") {
        return {
          kind: "estimated",
          day: published.day,
          when,
          by: "carrier",
          approvedBy: null,
          line: "Estimated by the carrier",
        };
      }
      const approvedBy = userName(directory, published.by.approvedBy);
      return {
        kind: "estimated",
        day: published.day,
        when,
        by: "notice",
        approvedBy,
        line: `Estimated by ${desk(directory)}, approved by ${approvedBy}`,
      };
    }
    case "under_review":
      return {
        kind: "under_review",
        was: published.was ?? null,
        line: `Delivery date under review${published.was ? ` (was ${formatDay(published.was)})` : ""}`,
      };
    default:
      return assertNever(published);
  }
}

export function customerSees(directory: Directory, view: CustomerView): CustomerSeesView {
  return {
    verdict: view.verdict,
    verdictLabel: verdictLabel(view),
    published: publishedView(directory, view.published, view.zone),
  };
}

/** How the published day compares with the committed one, when there is a published day. */
export function differenceLine(committed: LocalDate, published: CustomerPublished): string | null {
  if (published.kind === "under_review") return null;
  const late = diffDays(committed, published.day);
  if (late > 0) return `${days(late)} later than committed`;
  if (late < 0) return `${days(-late)} earlier than committed`;
  return "on the committed date";
}

function clearsImport(shipment: Shipment): boolean {
  return shipment.sections.some((section) => section.kind === "port" && section.gate === "import");
}

/**
 * Under DAP and CPT the buyer clears import wherever there is a border to clear: Estela says so
 * instead of ever suggesting that an import matter needs nothing from the consignee.
 */
export function incotermLine(shipment: Shipment, audience: "ops" | "customer"): string {
  const term = `${shipment.incoterm.code} ${shipment.incoterm.place}`;
  if (!clearsImport(shipment)) return term;
  return `${term}: ${audience === "ops" ? "the consignee clears import" : "you clear import"}`;
}

export function portalSummary(counts: { onTheWay: number; needAttention: number }): string {
  const moving =
    counts.onTheWay === 0
      ? "No shipments on the way."
      : `${plural(counts.onTheWay, "shipment")} on the way.`;
  if (counts.needAttention === 0) return moving;
  return `${moving} ${counts.needAttention} need${counts.needAttention === 1 ? "s" : ""} your attention.`;
}
