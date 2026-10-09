import { placeKey, type Place, type Section, type Shipment } from "./shipment";
import { stageOf } from "./stage";
import { physicalProgress, type Timeline } from "./timeline";

type Leg = Exclude<Section, { kind: "port" }>;

export type RouteStop = {
  place: Place;
  role: "origin" | "port" | "hub" | "consignee";
  /** The customs gate of a port, when it has one. */
  gate: "export" | "import" | null;
};

/** Waiting at a stop or under way on a leg, by index. */
export type RoutePosition = { on: "stop" | "leg"; index: number };

export type Route = {
  /** One more stop than legs: the origin, every port and the consignee. */
  stops: RouteStop[];
  legs: Leg[];
  /** `null` once delivered. */
  position: RoutePosition | null;
};

/**
 * The journey as stops and legs, with the cargo placed on it. A port is a stop; a road or sea
 * section is a leg. The position follows the furthest confirmed physical milestone: a vessel
 * that has arrived is at the port, a box that has gated out is on the next leg.
 */
export function routeOf(shipment: Shipment, timeline: Timeline): Route {
  const legs = shipment.sections.filter((section): section is Leg => section.kind !== "port");
  const first = legs[0];
  const places = first ? [first.from, ...legs.map((leg) => leg.to)] : [];

  const stops = places.map((place, index): RouteStop => {
    const port = shipment.sections.find(
      (section) => section.kind === "port" && placeKey(section.place) === placeKey(place),
    );
    let role: RouteStop["role"] = port ? "port" : "hub";
    if (index === 0) role = "origin";
    else if (index === places.length - 1) role = "consignee";
    return { place, role, gate: port?.kind === "port" ? (port.gate ?? null) : null };
  });

  let position: Route["position"] = { on: "stop", index: 0 };
  const { last } = physicalProgress(timeline);
  const section = last
    ? timeline.sections.find(({ entries }) => entries.includes(last))?.section
    : undefined;
  if (stageOf(timeline) === "delivered") position = null;
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

  return { stops, legs, position };
}
