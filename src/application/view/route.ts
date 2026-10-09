import { assertNever } from "@/domain/assert-never";
import type { CustomerView } from "@/domain/customer-view";
import type { Site } from "@/domain/directory";
import type { ExceptionHealth } from "@/domain/exceptions";
import { HEALTH_LABEL } from "@/domain/labels";
import type { ShipmentProjection } from "@/domain/projection";
import { routeOf, type RoutePosition, type RouteStop } from "@/domain/route";
import { siteOf, sourceName, type Directory } from "../directory";
import { list } from "../text/format";
import type { CustomerRouteView, RouteView } from "../views";

/** Where a problem is drawn: where the cargo is, or on the sailing a cut-off puts at risk. */
export type RouteProblem = { health: ExceptionHealth; on: "position" | "sailing" };

/** The route with nobody's name on it: all that drawing it takes, and all a customer's view has. */
type Journey = {
  stops: readonly { place: { name: string }; role: RouteStop["role"]; gate: RouteStop["gate"] }[];
  legs: readonly { mode: "road" | "sea" }[];
  position: RoutePosition | null;
};

function caption(stop: Journey["stops"][number], origin: Site | undefined): string {
  switch (stop.role) {
    case "origin":
      return origin?.role === "warehouse" ? "Warehouse" : "Plant";
    case "consignee":
      return "Consignee";
    case "port":
      return stop.gate ? `Port · ${stop.gate} customs` : "Port";
    case "hub":
      return "Hub";
    default:
      return assertNever(stop.role);
  }
}

/** Stops, legs, the problem where it is and the whole in words. */
function draw(
  journey: Journey,
  origin: Site | undefined,
  problem: RouteProblem | null,
): CustomerRouteView {
  const { position } = journey;
  const stops: CustomerRouteView["stops"] = journey.stops.map((stop) => ({
    name: stop.place.name,
    caption: caption(stop, origin),
    gate: stop.gate !== null,
    problem: null,
  }));
  const legs: CustomerRouteView["legs"] = journey.legs.map((leg) => ({
    mode: leg.mode,
    problem: null,
  }));

  if (problem && position) {
    const sailing = legs.find((leg) => leg.mode === "sea");
    const target =
      problem.on === "sailing" && sailing
        ? sailing
        : position.on === "stop"
          ? stops[position.index]
          : legs[position.index];
    if (target) target.problem = problem.health;
  }

  const first = stops[0]?.name ?? "";
  const destination = stops.at(-1)?.name ?? "";
  const modes = list(legs.map((leg) => leg.mode));
  let where = "Delivered";
  if (position?.on === "leg") {
    const leg = legs[position.index];
    const from = stops[position.index]?.name;
    const to = stops[position.index + 1]?.name;
    where = leg
      ? `${leg.mode === "sea" ? "At sea" : "On the road"} between ${from} and ${to}`
      : "Under way";
  } else if (position) {
    const stop = stops[position.index];
    if (position.index === 0) where = `At ${first}, not yet picked up`;
    else
      where = stop?.caption.startsWith("Port") ? `At the port of ${stop.name}` : `At ${stop?.name}`;
  }
  const trouble = problem ? `, ${HEALTH_LABEL[problem.health].toLowerCase()}` : "";

  return {
    stops,
    legs,
    position,
    label: `${first} to ${destination} by ${modes}. ${where}${trouble}.`,
  };
}

/** The route as operations see it: who carries each leg, and whether the position is overdue. */
export function routeView(
  directory: Directory,
  projection: ShipmentProjection,
  options: { problem: RouteProblem | null; stale: boolean },
): RouteView {
  const { shipment, timeline } = projection;
  const route = routeOf(shipment, timeline);
  const drawn = draw(
    { ...route, legs: route.legs.map((leg) => ({ mode: leg.kind })) },
    siteOf(directory, shipment.originSiteId),
    options.problem,
  );
  return {
    ...drawn,
    legs: route.legs.map((leg, index) => ({
      mode: leg.kind,
      operator: sourceName(directory, leg.operatorId),
      problem: drawn.legs[index]?.problem ?? null,
    })),
    stale: options.stale,
  };
}

/** The route as a customer sees it, drawn from the customer's own view and from nothing else. */
export function customerRouteView(
  directory: Directory,
  view: CustomerView,
  problem: RouteProblem | null,
): CustomerRouteView {
  return draw(view.route, siteOf(directory, view.originSiteId), problem);
}
