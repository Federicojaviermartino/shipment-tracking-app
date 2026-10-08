import type { RouteView } from "@/application/views";
import type { RouteLeg, RoutePosition, RouteStop } from "@/ui/kit/route-strip";

type RouteStripJourney = { stops: RouteStop[]; legs: RouteLeg[]; position: RoutePosition };

/**
 * A customer's route for the route strip. The only problem drawn on it is the one behind the
 * verdict (a confirmed hold or a published delay), so the verdict's words name it. The marker is
 * never drawn as a last known position: a customer reads the age of the last update instead.
 */
export function routeStripProps(route: RouteView, verdictLabel: string): RouteStripJourney {
  const problem = (status: RouteView["stops"][number]["problem"]) =>
    status ? { status, label: verdictLabel } : undefined;

  return {
    stops: route.stops.map((stop) => ({
      name: stop.name,
      caption: stop.caption,
      gate: stop.gate,
      problem: problem(stop.problem),
    })),
    legs: route.legs.map((leg) => ({
      mode: leg.mode,
      operator: leg.operator,
      problem: problem(leg.problem),
    })),
    position: route.position,
  };
}
