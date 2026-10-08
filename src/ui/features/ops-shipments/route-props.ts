import type { OpsRow } from "@/application/views";
import type { ExceptionHealth } from "@/domain/exceptions";
import { HEALTH_LABEL } from "@/domain/labels";
import type { RouteLeg, RoutePosition, RouteProblem, RouteStop } from "@/ui/kit/route-strip";

type RouteProps = {
  stops: RouteStop[];
  legs: RouteLeg[];
  position: RoutePosition;
  stale: boolean;
};

/** The route of a row as the strip takes it. A hold nobody has confirmed yet is drawn hollow. */
export function routeProps({ route, case: open }: OpsRow): RouteProps {
  const problem = (health: ExceptionHealth | null): RouteProblem | undefined =>
    health === null
      ? undefined
      : {
          status: health,
          label: HEALTH_LABEL[health],
          unconfirmed: open?.needsConfirmation === true && open.health === health,
        };

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
    stale: route.stale,
  };
}
