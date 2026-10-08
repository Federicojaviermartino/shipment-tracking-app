import { assertNever } from "@/domain/assert-never";
import type { UpstreamChange } from "@/domain/dates";
import type { EstimateStepSource } from "@/domain/estimate";
import { DESK_ZONE } from "@/domain/filters";
import type { ShipmentProjection } from "@/domain/projection";
import { diffDays, formatDay, localDate } from "@/domain/time";
import { deliveryOf, milestonesOf } from "@/domain/timeline";
import type { ReadContext } from "../context";
import { sourceName } from "../directory";
import { reportNoun, withoutFullStop } from "../text/format";
import type { DatesView, EstelaView, EstimateStepView } from "../views";

function upstreamWords(change: UpstreamChange): string {
  if (change.kind === "confirmed") return `${reportNoun(change.code)} was confirmed`;
  return change.code === "VESSEL_ARRIVED"
    ? "the vessel delay"
    : `the new estimate for ${reportNoun(change.code)}`;
}

function stepSourceLabel(from: EstimateStepSource, declaredBy: string | null): string {
  switch (from) {
    case "operator_estimate":
      return declaredBy ? `declared by ${declaredBy}` : "operator estimate";
    case "vessel_schedule":
      return "vessel schedule";
    case "lane_plan":
      return "lane plan";
    case "next_departure":
      return "next departure";
    case "assumption":
      return "assumed";
    default:
      return assertNever(from);
  }
}

function estelaView(context: ReadContext, projection: ShipmentProjection): EstelaView | null {
  const { dates, timeline } = projection;
  const { estela, estelaDay } = dates;
  if (!estela) return null;
  if (estela.withheld) return { kind: "withheld", line: `No estimate: ${estela.reason}.` };
  if (!estelaDay) return null;

  const milestones = milestonesOf(timeline);
  const steps = estela.steps.flatMap((step): EstimateStepView[] => {
    const entry = milestones.find((candidate) => candidate.key === step.milestoneKey);
    if (!entry) return [];
    const declaredBy = entry.operatorEstimate
      ? sourceName(context.directory, entry.operatorEstimate.provenance.source)
      : null;
    return [
      {
        milestoneKey: step.milestoneKey,
        label: step.label,
        when: { at: step.at, precision: step.precision, zone: entry.place.zone },
        from: step.from,
        fromLabel: stepSourceLabel(step.from, declaredBy),
      },
    ];
  });

  const planned = deliveryOf(timeline)?.planned;
  const plannedDay = planned ? localDate(planned.at, dates.zone) : null;
  let was = "";
  if (dates.operator?.superseded) was = ` (was ${formatDay(dates.operator.day)})`;
  else if (plannedDay && plannedDay !== estelaDay) was = ` (planned ${formatDay(plannedDay)})`;

  return {
    kind: "estimate",
    day: estelaDay,
    at: estela.at,
    window: {
      earliest: localDate(estela.window.earliest, dates.zone),
      latest: localDate(estela.window.latest, dates.zone),
    },
    basis: estela.basis,
    agreesWithOperator: dates.agreesWithOperator,
    lateBy: diffDays(dates.committed, estelaDay),
    headline: `Delivery estimate ${formatDay(estelaDay)}${was}.`,
    steps,
    firmsUp: estela.firmsUpWhen ? `Firms up when ${estela.firmsUpWhen}.` : null,
    assumption: estela.assumption ? `Assumes: ${estela.assumption}.` : null,
  };
}

/** The three dates of a shipment, each with who stands behind it, plus the one to show first. */
export function datesView(context: ReadContext, projection: ShipmentProjection): DatesView {
  const { dates } = projection;
  const { zone, committed } = dates;
  const name = (source: string) => sourceName(context.directory, source);
  const lateBy = (day: string) => diffDays(committed, day);

  const delivered = dates.delivered
    ? {
        day: dates.delivered.day,
        when: { at: dates.delivered.at, precision: dates.delivered.precision, zone },
        by: name(dates.delivered.provenance.source),
      }
    : null;

  const declared = dates.operator;
  const operator = declared
    ? {
        day: declared.day,
        when: { at: declared.at, precision: declared.precision, zone },
        by: name(declared.provenance.source),
        declaredAt: declared.provenance.receivedAt,
        lateBy: lateBy(declared.day),
        superseded: declared.superseded,
        supersededNote: declared.supersededBy
          ? `declared ${formatDay(localDate(declared.provenance.receivedAt, DESK_ZONE))}, before ${upstreamWords(declared.supersededBy)}`
          : null,
      }
    : null;

  const taken = dates.withdrawn;
  const withdrawn = taken
    ? {
        day: taken.day,
        by: name(taken.provenance.source),
        at: taken.withdrawnAt,
        line: `Withdrawn by ${name(taken.provenance.source)}${taken.reason ? `: ${withoutFullStop(taken.reason)}` : ""}`,
      }
    : null;

  const estela = estelaView(context, projection);

  let best: DatesView["best"] = null;
  if (delivered) {
    best = { ...delivered, provenance: "confirmed", lateBy: lateBy(delivered.day) };
  } else if (dates.best) {
    const fromOperator = dates.best.basis === "operator_estimate";
    best = {
      day: dates.best.day,
      when: { at: dates.best.at, precision: dates.best.precision, zone },
      provenance: fromOperator ? "declared" : "estimated",
      by: fromOperator && declared ? name(declared.provenance.source) : null,
      lateBy: lateBy(dates.best.day),
    };
  } else if (dates.published.kind === "planned") {
    // Nobody has declared or estimated a door date: the plan stands for as long as it can be met.
    const { day, at, precision } = dates.published;
    best = {
      day,
      when: { at, precision, zone },
      provenance: "planned",
      by: null,
      lateBy: lateBy(day),
    };
  }

  let bestMissing: string | null = null;
  if (!best) bestMissing = estela?.kind === "withheld" ? estela.line : "No estimate yet.";

  return { zone, committed, delivered, operator, withdrawn, estela, best, bestMissing };
}
