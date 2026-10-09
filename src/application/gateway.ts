import { applyFilter } from "@/domain/filters";
import { plural } from "@/domain/labels";
import type { LoggedEvent } from "@/domain/log";
import { inScope, type Actor, type InternalActor } from "@/domain/perimeter";
import type { ShipmentProjection } from "@/domain/projection";
import { compareQueueRows } from "@/domain/queue";
import { compareText } from "@/domain/compare";
import { deadlineZone } from "@/domain/shipment";
import { answerQuestion, notUnderstood, vocabularyOf } from "./ask";
import { createCommands } from "./commands";
import type { ReadContext } from "./context";
import type { Directory } from "./directory";
import { isDraftable, planDraft } from "./drafting";
import type { Estela, QueueView } from "./estela";
import type { Ingestion } from "./ingestion";
import { createLive } from "./live";
import type { Clock } from "./ports/clock";
import type { DemoFeed, LogView } from "./ports/demo-feed";
import type { DigestCase, DigestWriter } from "./ports/digest-writer";
import type { EtaEstimator } from "./ports/eta-estimator";
import type { EventStore } from "./ports/event-store";
import type { MessageDrafter } from "./ports/message-drafter";
import type { QueryInterpreter } from "./ports/query-interpreter";
import { SUGGESTED_QUERIES } from "./ports/query-interpreter.cases";
import { createProjector, type World } from "./projections";
import { permissionFor } from "./text/case-text";
import { describeFilter } from "./text/filter-text";
import { perimeterWords } from "./text/perimeter-text";
import type { DigestHighlight, OpsOverview } from "./views";
import { opsOverview, opsRow, opsShipment } from "./view/ops";
import { customerView, portalHome, portalShipment } from "./view/portal";

export type GatewayDeps = {
  directory: Directory;
  store: EventStore;
  clock: Clock;
  ingestion: Ingestion;
  demoFeed: DemoFeed;
  estimator: EtaEstimator;
  digestWriter: DigestWriter;
  drafter: MessageDrafter;
  queryInterpreter: QueryInterpreter;
  /** Where an error goes that no caller is waiting to catch: a screen's listener that threw. */
  reportError: (error: unknown) => void;
};

/** A model call that fails, by rejecting or by throwing, is a model call that answered nothing. */
async function attempt<Result>(call: () => Promise<Result>): Promise<Result | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

/**
 * The operations side is for Ibón staff. The signatures say so to the compiler; at run time a
 * persona that a caller narrowed wrongly is still an actor like any other, so every operations
 * query asks again and answers anybody else as it answers "out of perimeter": with nothing.
 */
function staffOnly(actor: Actor): InternalActor | null {
  return actor.kind === "internal" ? actor : null;
}

const NO_DESK: OpsOverview = {
  identity: "",
  counts: {
    attention: 0,
    waiting: 0,
    all: 0,
    delayed: 0,
    held: 0,
    atRisk: 0,
    stale: 0,
    onPlan: 0,
    deliveredSinceYesterday: 0,
  },
  line: "",
  lastOperatorUpdateAt: null,
  filterOptions: { countries: [], sites: [], accounts: [], operators: [], vessels: [] },
  suggestions: [],
};

/** How many cases the generated sentence of the briefing speaks about. */
const HIGHLIGHT_CASES = 2;

function group(row: ShipmentProjection): number {
  if (row.primary?.state === "needs_action") return 0;
  if (row.primary) return 1;
  return row.health === "delivered" ? 3 : 2;
}

/**
 * The order of every list of rows: cases that need the reader by their clock, then the ones
 * that are waiting, then what is moving as planned by committed date, then what was delivered.
 */
function inListOrder(rows: readonly ShipmentProjection[]): ShipmentProjection[] {
  return [...rows].sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b);
    if (a.primary && b.primary) {
      return compareQueueRows(
        { committedDate: a.shipment.committedDate, exception: a.primary },
        { committedDate: b.shipment.committedDate, exception: b.primary },
      );
    }
    return (
      compareText(a.shipment.committedDate, b.shipment.committedDate) ||
      compareText(a.shipment.id, b.shipment.id)
    );
  });
}

function inView(row: ShipmentProjection, view: QueueView): boolean {
  if (view === "all") return true;
  return row.primary?.state === (view === "attention" ? "needs_action" : "waiting");
}

/**
 * The use cases behind the one interface the UI calls. Reads take the current world from the
 * projector, apply the perimeter and build views; commands and the demo feed append to the log,
 * and everything else follows from that.
 */
export function createGateway(deps: GatewayDeps): Estela {
  const { directory, store, clock, ingestion, demoFeed } = deps;
  const projector = createProjector({ directory, store, clock, estimator: deps.estimator });
  const live = createLive({ directory, store, projector, report: deps.reportError });
  const execute = createCommands({ directory, store, clock, projector });
  const sending = new Set<string>();
  const log: LogView = {
    events: () => store.events(),
    received: (messageId) => ingestion.received(messageId),
  };

  const contextAt = (world: World): ReadContext => ({
    directory,
    now: world.now,
    rawOf: (id) => store.raw(id),
  });
  const scoped = (actor: Actor, world: World) =>
    inListOrder(world.rows.filter((row) => inScope(actor, row.shipment)));
  const eventsOf = (world: World, row: ShipmentProjection): readonly LoggedEvent[] =>
    world.eventsOf.get(row.shipment.id) ?? [];
  /** Unknown and out of perimeter are one answer, so that existence never leaks. */
  const find = (actor: Actor, world: World, id: string) => {
    const row = world.byId.get(id);
    return row && inScope(actor, row.shipment) ? row : null;
  };

  async function highlight(asker: Actor): Promise<DigestHighlight | null> {
    const actor = staffOnly(asker);
    if (!actor) return null;
    const world = await projector.current();
    // Where acting today changes the outcome: nothing has gone wrong yet, and a deadline is near.
    const cases = scoped(actor, world)
      .flatMap((row): DigestCase[] => {
        const open = row.primary;
        if (!open || open.state !== "needs_action" || open.health !== "at_risk") return [];
        const deadline = open.actBy?.deadline;
        if (!deadline || deadline.at <= world.now) return [];
        const milestone = row.shipment.plan.find((m) => m.key === deadline.milestoneKey);
        return [
          {
            shipmentId: row.shipment.id,
            exception: open.type,
            deadline: {
              kind: deadline.kind,
              at: deadline.at,
              zone: deadlineZone(row.shipment, deadline),
              milestone: milestone ? { code: milestone.code, place: milestone.place.name } : null,
            },
            documents: open.steps.flatMap((step) =>
              step.kind === "send_document" && step.state !== "done" && step.docType
                ? [step.docType]
                : [],
            ),
            vessel: row.shipment.voyage?.vessel ?? null,
          },
        ];
      })
      .sort((a, b) => a.deadline.at - b.deadline.at)
      .slice(0, HIGHLIGHT_CASES);
    if (cases.length === 0) return null;

    // Fail closed: without the sentence, the computed counts still say everything that is true.
    const text = await attempt(() => deps.digestWriter.highlight({ now: world.now, cases }));
    if (!text) return null;
    return {
      text,
      caption:
        cases.length === 1
          ? "Written by AI from the nearest deadline"
          : `Written by AI from the ${cases.length} nearest deadlines`,
      shipmentIds: cases.map((item) => item.shipmentId),
    };
  }

  return {
    now: () => clock.now(),
    actors: () => [...directory.actors],

    ops: {
      async overview(asker: Actor) {
        const actor = staffOnly(asker);
        if (!actor) return NO_DESK;
        const world = await projector.current();
        return opsOverview(contextAt(world), actor, scoped(actor, world), SUGGESTED_QUERIES);
      },
      highlight,
      async shipments(asker: Actor, query) {
        const actor = staffOnly(asker);
        if (!actor) return [];
        const world = await projector.current();
        const context = contextAt(world);
        const listed = scoped(actor, world).filter((row) => inView(row, query.view));
        const rows = query.filter ? applyFilter(listed, query.filter, world.now) : listed;
        return rows.map((row) => opsRow(context, actor, row, eventsOf(world, row)));
      },
      async shipment(asker: Actor, id) {
        const actor = staffOnly(asker);
        if (!actor) return null;
        const world = await projector.current();
        const row = find(actor, world, id);
        return row ? opsShipment(contextAt(world), actor, row, eventsOf(world, row)) : null;
      },
      async ask(asker: Actor, text) {
        const actor = staffOnly(asker);
        if (!actor) return notUnderstood(text, []);
        const world = await projector.current();
        const context = contextAt(world);
        return answerQuestion({
          text,
          context,
          interpreter: deps.queryInterpreter,
          scoped: scoped(actor, world),
          toRow: (row) => opsRow(context, actor, row, eventsOf(world, row)),
        });
      },
      describeFilter(asker: Actor, filter) {
        const actor = staffOnly(asker);
        const now = clock.now();
        const visible = directory.shipments.filter(
          (shipment) => actor !== null && inScope(actor, shipment),
        );
        const vocabulary = vocabularyOf({ directory, now, rawOf: (id) => store.raw(id) }, visible);
        return describeFilter(filter, vocabulary, now);
      },
      async draft(asker: Actor, shipmentId, kind) {
        const actor = staffOnly(asker);
        if (!actor) return null;
        const world = await projector.current();
        const row = find(actor, world, shipmentId);
        if (!row) return null;
        // The case that still needs the step comes first; a step that is done can be drafted again.
        const candidates = row.exceptions.flatMap((exception) =>
          exception.steps.flatMap((step) =>
            step.kind === kind && isDraftable(step) ? [{ exception, step }] : [],
          ),
        );
        const target =
          candidates.find(({ step }) => step.state !== "done") ?? candidates[0] ?? null;
        if (!target) return null;
        // Nothing is drafted for a step the actor may not take, or that waits on a confirmation.
        const context = contextAt(world);
        const { why } = permissionFor(context, actor, row.shipment, target.exception, target.step);
        if (why === "role" || why === "reading") return null;

        const plan = planDraft(
          context,
          actor,
          row,
          target.exception,
          target.step,
          eventsOf(world, row),
        );
        // Fail closed: a drafter that breaks leaves the facts and an empty message to write by hand.
        const text = await attempt(() => deps.drafter.draft(plan.request));
        return {
          ...plan.frame,
          subject: text?.subject ?? "",
          body: text?.body ?? "",
          writtenByAi: text !== null,
          facts: plan.lines.map((line) => ({
            ...line,
            used: text?.factsUsed.includes(line.id) ?? false,
          })),
        };
      },
      async execute(actor, command) {
        const result = await execute(actor, command);
        await live.settled();
        return result;
      },
    },

    portal: {
      async home(actor) {
        const world = await projector.current();
        const views = scoped(actor, world).map((row) =>
          customerView(row, eventsOf(world, row), world.now),
        );
        return portalHome(contextAt(world), actor.accountId, views);
      },
      async shipment(actor, id) {
        const world = await projector.current();
        const row = find(actor, world, id);
        if (!row) return null;
        return portalShipment(contextAt(world), customerView(row, eventsOf(world, row), world.now));
      },
    },

    subscribe: (actor, listener) => live.subscribe(actor, listener),

    demo: {
      personas: () =>
        directory.actors.map((actor) => {
          const count = directory.shipments.filter((shipment) => inScope(actor, shipment)).length;
          return {
            actor,
            side: actor.kind === "internal" ? ("operations" as const) : ("customer" as const),
            perimeter: `${perimeterWords(directory, actor)} · ${plural(count, "shipment")}`,
          };
        }),
      events: () => demoFeed.events(log),
      async send(id) {
        const ready = demoFeed
          .events(log)
          .some((event) => event.id === id && event.state === "ready");
        // Ingestion is asynchronous: until it lands in the log, the event still reads as ready.
        if (!ready || sending.has(id)) return;
        sending.add(id);
        try {
          await ingestion.ingest(demoFeed.messages(id, clock.now()));
          await live.settled();
        } finally {
          sending.delete(id);
        }
      },
      reset: () => store.reset(),
      subscribe: (listener) => live.onAnyChange(listener),
    },
  };
}
