import type { EstelaEstimate } from "@/domain/estimate";
import { buildTimeline } from "@/domain/fold";
import type { LoggedEvent } from "@/domain/log";
import { projectShipment, type ShipmentProjection } from "@/domain/projection";
import type { Shipment, ShipmentId } from "@/domain/shipment";
import { nextExpectation } from "@/domain/staleness";
import { MINUTE, type Instant } from "@/domain/time";
import { isDelivered, type Timeline } from "@/domain/timeline";
import type { Directory } from "./directory";
import type { Clock } from "./ports/clock";
import type { EtaEstimator } from "./ports/eta-estimator";
import type { EventStore } from "./ports/event-store";
import { ESTIMATOR_UNAVAILABLE, overdueReason } from "./text/case-text";

/** Every shipment derived from the log at one instant. Nothing in it is stored anywhere. */
export type World = {
  now: Instant;
  rows: readonly ShipmentProjection[];
  byId: ReadonlyMap<ShipmentId, ShipmentProjection>;
  /** Each shipment's own slice of the log. */
  eventsOf: ReadonlyMap<ShipmentId, readonly LoggedEvent[]>;
};

export type Projector = {
  /** The world as of now, shared by every read until the log or the minute changes. */
  current(): Promise<World>;
  /** One shipment from a chosen set of its events: for before-and-after and what-if questions. */
  project(
    shipment: Shipment,
    events: readonly LoggedEvent[],
    now: Instant,
  ): Promise<ShipmentProjection>;
};

type Folded = {
  events: readonly LoggedEvent[];
  slices: Map<ShipmentId, LoggedEvent[]>;
  timelines: Map<ShipmentId, Timeline>;
};

/**
 * Derives everything on read and remembers the result. The fold depends on the log alone, so it
 * is kept per log version; the rules also read the clock (staleness, cut-offs, "never in the
 * past"), so the projections are kept per log version and per minute: a cache keyed on the log
 * alone would go stale by itself. The estimator is asked once per shipment per snapshot, which
 * is why opening a screen never waits on a model.
 */
export function createProjector(deps: {
  directory: Directory;
  store: EventStore;
  clock: Clock;
  estimator: EtaEstimator;
}): Projector {
  const { directory, store, clock, estimator } = deps;
  let folded: Folded | null = null;
  let cached: { events: readonly LoggedEvent[]; minute: number; world: Promise<World> } | null =
    null;

  function fold(events: readonly LoggedEvent[]): Folded {
    if (folded?.events === events) return folded;
    const slices = new Map<ShipmentId, LoggedEvent[]>(
      directory.shipments.map((shipment) => [shipment.id, []]),
    );
    for (const event of events) slices.get(event.shipmentId)?.push(event);
    const timelines = new Map(
      directory.shipments.map((shipment) => [
        shipment.id,
        buildTimeline(shipment, slices.get(shipment.id) ?? []),
      ]),
    );
    folded = { events, slices, timelines };
    return folded;
  }

  /**
   * The estimate of an open shipment, or the reason there is none. Both guards stand here, around
   * the port, so that they hold for whatever adapter is behind it: a shipment that owes an update
   * is not put to the model at all, and a model that breaks is a withheld estimate that says so.
   * Nothing downstream can then mistake "the model failed" for "the model agrees".
   */
  async function estimateFor(
    shipment: Shipment,
    timeline: Timeline,
    now: Instant,
  ): Promise<EstelaEstimate | null> {
    if (isDelivered(timeline)) return null;
    const expectation = nextExpectation(timeline);
    if (expectation && now > expectation.by) {
      return { withheld: true, reason: overdueReason(directory, expectation, now) };
    }
    try {
      return await estimator.estimate({ shipment, timeline, now });
    } catch {
      return { withheld: true, reason: ESTIMATOR_UNAVAILABLE };
    }
  }

  async function project(
    shipment: Shipment,
    events: readonly LoggedEvent[],
    now: Instant,
    timeline: Timeline = buildTimeline(shipment, events),
  ): Promise<ShipmentProjection> {
    const estimate = await estimateFor(shipment, timeline, now);
    return projectShipment({ shipment, events, estimate, now, timeline });
  }

  async function compute(events: readonly LoggedEvent[], now: Instant): Promise<World> {
    const { slices, timelines } = fold(events);
    const rows = await Promise.all(
      directory.shipments.map((shipment) =>
        project(shipment, slices.get(shipment.id) ?? [], now, timelines.get(shipment.id)),
      ),
    );
    return {
      now,
      rows,
      byId: new Map(rows.map((row) => [row.shipment.id, row])),
      eventsOf: slices,
    };
  }

  return {
    current() {
      const events = store.events();
      const now = clock.now();
      const minute = Math.floor(now / MINUTE);
      if (cached?.events === events && cached.minute === minute) return cached.world;
      const world = compute(events, now);
      cached = { events, minute, world };
      return world;
    },
    project: (shipment, events, now) => project(shipment, events, now),
  };
}
