import { eventId, type LoggedEvent, type OperatorEvent } from "@/domain/log";
import { inScope, type Actor } from "@/domain/perimeter";
import type { ShipmentProjection } from "@/domain/projection";
import type { Shipment, ShipmentId } from "@/domain/shipment";
import { sourceName, type Directory } from "./directory";
import type { EventStore, Unsubscribe } from "./ports/event-store";
import type { Projector } from "./projections";
import { feedHeadline, feedSentence } from "./text/feed-text";
import type { Change, FeedNotice } from "./views";

export type Live = {
  subscribe(actor: Actor, listener: (change: Change) => void): Unsubscribe;
  /** Fires after any change of the log, whoever may see it. */
  onAnyChange(listener: () => void): Unsubscribe;
  /** Resolves once every change so far has been announced. */
  settled(): Promise<void>;
};

type Comparison = {
  events: OperatorEvent[];
  before: Map<ShipmentId, ShipmentProjection>;
  after: Map<ShipmentId, ShipmentProjection>;
};

function needsNotice(projection: ShipmentProjection | undefined): boolean {
  return (
    projection?.exceptions.some((exception) =>
      exception.steps.some((step) => step.kind === "notify_customer" && step.state !== "done"),
    ) ?? false
  );
}

/**
 * Turns changes of the log into hints for whoever is looking. The log is the only trigger: an
 * append made by this tab and one that arrives from another tab are announced the same way. A
 * hint carries shipment ids, never data, and each listener only hears about its own perimeter;
 * when operator events came in, operations also get a notice built by comparing each touched
 * shipment with and without them at the same instant, so that nothing but the events themselves
 * can explain the difference.
 *
 * A listener is somebody else's code. One that throws has failed alone: the others are still
 * told, and its error goes to `report`, because nobody is waiting on an announcement to catch it.
 */
export function createLive(deps: {
  directory: Directory;
  store: EventStore;
  projector: Projector;
  report: (error: unknown) => void;
}): Live {
  const { directory, store, projector, report } = deps;
  const subscribers = new Set<{ actor: Actor; listener: (change: Change) => void }>();
  const watchers = new Set<() => void>();
  const shipments = new Map<ShipmentId, Shipment>(directory.shipments.map((s) => [s.id, s]));
  let known = new Map<string, ShipmentId>(
    store.events().map((event) => [eventId(event), event.shipmentId]),
  );
  let queue: Promise<void> = Promise.resolve();

  async function compare(fresh: readonly LoggedEvent[]): Promise<Comparison | null> {
    const events = fresh.filter((event): event is OperatorEvent => event.kind === "operator");
    if (events.length === 0) return null;
    const world = await projector.current();
    const freshIds = new Set(fresh.map(eventId));
    const before = new Map<ShipmentId, ShipmentProjection>();
    const after = new Map<ShipmentId, ShipmentProjection>();
    for (const id of new Set(events.map((event) => event.shipmentId))) {
      const shipment = shipments.get(id);
      const now = world.byId.get(id);
      if (!shipment || !now) continue;
      const earlier = (world.eventsOf.get(id) ?? []).filter((e) => !freshIds.has(eventId(e)));
      after.set(id, now);
      before.set(id, await projector.project(shipment, earlier, world.now));
    }
    return { events, before, after };
  }

  function noticeFor(actor: Actor, comparison: Comparison | null): FeedNotice | null {
    // An operator's name and words are never pushed to a customer.
    if (!comparison || actor.kind !== "internal") return null;
    const visible = comparison.events.filter((event) => {
      const shipment = shipments.get(event.shipmentId);
      return shipment !== undefined && inScope(actor, shipment);
    });
    const lead = visible[0];
    if (!lead) return null;

    const affected = [...new Set(visible.map((event) => event.shipmentId))];
    const vessels = new Set(affected.map((id) => shipments.get(id)?.voyage?.vessel));
    const [vessel] = vessels;
    const notice = {
      operatorName: sourceName(directory, lead.source),
      headline: feedHeadline(visible, comparison.before),
      affected: affected.length,
      needNotice: affected.filter((id) => needsNotice(comparison.after.get(id))).length,
      resolved: affected.filter(
        (id) =>
          (comparison.before.get(id)?.exceptions.length ?? 0) > 0 &&
          comparison.after.get(id)?.exceptions.length === 0,
      ),
    };
    const [only] = affected;
    return {
      ...notice,
      text: feedSentence(notice),
      filter:
        affected.length === 1 && only
          ? { text: only }
          : vessels.size === 1 && vessel
            ? { vessel }
            : null,
    };
  }

  function tell(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      report(error);
    }
  }

  async function announce(): Promise<void> {
    const events = store.events();
    const current = new Map(events.map((event) => [eventId(event), event.shipmentId]));
    const fresh = events.filter((event) => !known.has(eventId(event)));
    const gone = [...known].filter(([id]) => !current.has(id)).map(([, shipmentId]) => shipmentId);
    known = current;

    for (const watcher of [...watchers]) tell(watcher);
    const touched = [...new Set([...fresh.map((event) => event.shipmentId), ...gone])];
    if (touched.length === 0) return;

    const comparison = await compare(fresh);
    for (const { actor, listener } of [...subscribers]) {
      const shipmentIds = touched.filter((id) => {
        const shipment = shipments.get(id);
        return shipment !== undefined && inScope(actor, shipment);
      });
      if (shipmentIds.length === 0) continue;
      const change = { shipmentIds, notice: noticeFor(actor, comparison) };
      tell(() => listener(change));
    }
  }

  store.subscribe(() => {
    // One at a time and in order; a failed announcement must not silence the ones after it.
    queue = queue.then(announce).catch(report);
  });

  return {
    subscribe(actor, listener) {
      const subscriber = { actor, listener };
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    onAnyChange(listener) {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
    settled: () => queue,
  };
}
