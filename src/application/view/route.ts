import type { ExceptionHealth } from "@/domain/exceptions";
import { HEALTH_LABEL } from "@/domain/labels";
import type { ShipmentProjection } from "@/domain/projection";
import { placeKey, type Section } from "@/domain/shipment";
import { physicalProgress } from "@/domain/timeline";
import { siteOf, sourceName, type Directory } from "../directory";
import { list } from "../text/format";
import type { RouteView } from "../views";

type Leg = Exclude<Section, { kind: "port" }>;

/** Where a problem is drawn: where the cargo is, or on the sailing a cut-off puts at risk. */
export type RouteProblem = { health: ExceptionHealth; on: "position" | "sailing" };

/**
 * The journey as stops and legs, with the cargo placed on it. A port is a stop; a road or sea
 * section is a leg. The position follows the furthest confirmed physical milestone: a vessel
 * that has arrived is at the port, a box that has gated out is on the next leg.
 */
export function routeView(
  directory: Directory,
  projection: ShipmentProjection,
  options: { problem: RouteProblem | null; stale: boolean },
): RouteView {
  const { shipment, timeline } = projection;
  const legs = shipment.sections.filter((section): section is Leg => section.kind !== "port");
  const first = legs[0];
  const places = first ? [first.from, ...legs.map((leg) => leg.to)] : [];
  const site = siteOf(directory, shipment.originSiteId);

  const stops: RouteView["stops"] = places.map((place, index) => {
    const port = shipment.sections.find(
      (section) => section.kind === "port" && placeKey(section.place) === placeKey(place),
    );
    const gate = port?.kind === "port" ? port.gate : undefined;
    let caption = "Hub";
    if (index === 0) caption = site?.role === "warehouse" ? "Warehouse" : "Plant";
    else if (index === places.length - 1) caption = "Consignee";
    else if (port) caption = gate ? `Port · ${gate} customs` : "Port";
    return { name: place.name, caption, gate: gate !== undefined, problem: null };
  });
  const routeLegs: RouteView["legs"] = legs.map((leg) => ({
    mode: leg.kind,
    operator: sourceName(directory, leg.operatorId),
    problem: null,
  }));

  let position: RouteView["position"] = { on: "stop", index: 0 };
  const { last } = physicalProgress(timeline);
  const section = last
    ? timeline.sections.find(({ entries }) => entries.includes(last))?.section
    : undefined;
  if (projection.stage === "delivered") position = null;
  else if (last && section?.kind === "port") {
    const stop = places.findIndex((place) => placeKey(place) === placeKey(section.place));
    position =
      last.code === "GATE_OUT" && stop < legs.length
        ? { on: "leg", index: stop }
        : { on: "stop", index: Math.max(stop, 0) };
  } else if (last && section) {
    const leg = legs.findIndex((candidate) => candidate.id === section.id);
    position =
      last.code === "VESSEL_ARRIVED" ? { on: "stop", index: leg + 1 } : { on: "leg", index: leg };
  }

  const { problem } = options;
  if (problem && position) {
    const sailing = routeLegs.find((leg) => leg.mode === "sea");
    const target =
      problem.on === "sailing" && sailing
        ? sailing
        : position.on === "stop"
          ? stops[position.index]
          : routeLegs[position.index];
    if (target) target.problem = problem.health;
  }

  const origin = places[0]?.name ?? "";
  const destination = places.at(-1)?.name ?? "";
  const modes = list(legs.map((leg) => leg.kind));
  let where = "Delivered";
  if (position?.on === "leg") {
    const leg = legs[position.index];
    where = leg
      ? `${leg.kind === "sea" ? "At sea" : "On the road"} between ${leg.from.name} and ${leg.to.name}`
      : "Under way";
  } else if (position) {
    const stop = stops[position.index];
    if (position.index === 0) where = `At ${origin}, not yet picked up`;
    else
      where = stop?.caption.startsWith("Port") ? `At the port of ${stop.name}` : `At ${stop?.name}`;
  }
  const trouble = problem ? `, ${HEALTH_LABEL[problem.health].toLowerCase()}` : "";

  return {
    stops,
    legs: routeLegs,
    position,
    stale: options.stale,
    label: `${origin} to ${destination} by ${modes}. ${where}${trouble}.`,
  };
}
