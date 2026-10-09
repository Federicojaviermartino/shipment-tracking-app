import { describe, expect, test, vi } from "vitest";
import { BrowserEventStore } from "@/adapters/memory/browser-event-store";
import { DemoClock, ManualClock } from "@/adapters/memory/clocks";
import { fakeBrowserStorage } from "@/adapters/memory/test-support";
import type { Estela } from "@/application/estela";
import type { Change } from "@/application/views";
import type { ExternalActor, InternalActor } from "@/domain/perimeter";
import { HOUR, MINUTE } from "@/domain/time";
import { T0 } from "@/fixtures";
import { createEstela } from "./create-estela";

/**
 * Two tabs of one browser: each builds its own core over the same storage, exactly as two
 * windows of the prototype do. Nothing connects them but the log.
 */
async function browser() {
  const storage = fakeBrowserStorage();
  const clock = new ManualClock(T0);
  const openTab = async () => {
    const store = new BrowserEventStore(storage.tab());
    const estela = await createEstela({ clock, store, aiLatencyMs: 0 });
    return { store, estela };
  };
  return { clock, openTab };
}

function personas(estela: Estela) {
  const [marta, , , mariana] = estela.actors();
  if (marta?.kind !== "internal" || mariana?.kind !== "external") throw new Error("No personas");
  return { marta, mariana } satisfies { marta: InternalActor; mariana: ExternalActor };
}

async function approveNotice(estela: Estela, marta: InternalActor, shipmentId: string) {
  const draft = await estela.ops.draft(marta, shipmentId, "notify_customer");
  if (!draft) throw new Error("Nothing to notify");
  return estela.ops.execute(marta, {
    type: "send_notice",
    shipmentId,
    exception: draft.exception,
    subject: draft.subject,
    body: draft.body,
    expectedDay: draft.publishes?.day ?? null,
  });
}

describe("two tabs over one log", () => {
  test("what operations approve in one window, the customer reads in the other", async () => {
    const { clock, openTab } = await browser();
    const operations = await openTab();
    const portal = await openTab();
    const { marta, mariana } = personas(operations.estela);
    const heard: Change[] = [];
    portal.estela.subscribe(mariana, (change) => heard.push(change));

    clock.advance(5 * MINUTE);
    await operations.estela.demo.send("A");
    await vi.waitFor(() => expect(heard).toHaveLength(1));
    expect(heard[0]).toEqual({ shipmentIds: ["EST-4058", "EST-4063"], notice: null });
    expect(await portal.estela.portal.shipment(mariana, "EST-4058")).toMatchObject({
      verdict: "in_progress",
      published: { kind: "under_review" },
    });

    clock.advance(5 * MINUTE);
    expect(await approveNotice(operations.estela, marta, "EST-4058")).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(heard).toHaveLength(2));
    expect(await portal.estela.portal.shipment(mariana, "EST-4058")).toMatchObject({
      verdict: "delayed",
      published: { kind: "estimated", day: "2026-10-16", approvedBy: "Marta Soler" },
    });
  });

  test("an operator update sent from one window is announced, with its notice, to operations in the other", async () => {
    const { openTab } = await browser();
    const one = await openTab();
    const two = await openTab();
    const { marta } = personas(two.estela);
    const heard: Change[] = [];
    two.estela.subscribe(marta, (change) => heard.push(change));

    await one.estela.demo.send("A");
    await vi.waitFor(() => expect(heard).toHaveLength(1));
    expect(heard[0]?.notice).toMatchObject({
      operatorName: "Noray Lines",
      affected: 2,
      needNotice: 1,
    });
  });

  test("the scripted events are in the same state in every window, because sent is read from the log", async () => {
    const { openTab } = await browser();
    const one = await openTab();
    const two = await openTab();
    let refreshed = 0;
    two.estela.demo.subscribe(() => {
      refreshed += 1;
    });

    await one.estela.demo.send("A");
    await vi.waitFor(() => expect(refreshed).toBe(1));
    expect(two.estela.demo.events().map((event) => `${event.id}:${event.state}`)).toEqual([
      "A:sent",
      "B:ready",
      "C:blocked",
      "D:ready",
    ]);
    // Sending it again from the second window does nothing: it is already in the log.
    const logged = two.store.events().length;
    await two.estela.demo.send("A");
    expect(two.store.events()).toHaveLength(logged);
  });

  test("a reload keeps the session: decisions refer to seed events by keys that are the same every time", async () => {
    const { clock, openTab } = await browser();
    const first = await openTab();
    const { marta, mariana } = personas(first.estela);
    const reading = (await first.estela.ops.shipment(marta, "EST-4012"))?.case?.reading;
    clock.advance(5 * MINUTE);
    await first.estela.ops.execute(marta, {
      type: "confirm_reading",
      shipmentId: "EST-4012",
      eventKey: reading?.eventKey ?? "",
      accepted: true,
    });
    await first.estela.demo.send("D");

    const reloaded = await openTab();
    const view = await reloaded.estela.ops.shipment(marta, "EST-4012");
    expect(view?.case?.reading).toMatchObject({ state: "ai_accepted", reviewedBy: "Marta Soler" });
    expect(await reloaded.estela.portal.shipment(mariana, "EST-4012")).toMatchObject({
      verdict: "on_hold",
    });
    expect((await reloaded.estela.ops.shipment(marta, "EST-4127"))?.health).toBe("on_time");
    expect(reloaded.estela.demo.events()[3]).toMatchObject({ id: "D", state: "sent" });
    expect(reloaded.store.events()).toEqual(first.store.events());
  });

  test("resetting in one window takes every window back to the seed", async () => {
    const { clock, openTab } = await browser();
    const one = await openTab();
    const two = await openTab();
    const { marta } = personas(two.estela);
    const heard: Change[] = [];
    two.estela.subscribe(marta, (change) => heard.push(change));

    clock.advance(5 * MINUTE);
    await one.estela.demo.send("A");
    await vi.waitFor(() => expect(heard).toHaveLength(1));
    expect((await two.estela.ops.shipment(marta, "EST-4058"))?.health).toBe("at_risk");

    one.estela.demo.reset();
    await vi.waitFor(() => expect(heard).toHaveLength(2));
    expect(heard[1]).toEqual({ shipmentIds: ["EST-4058", "EST-4063"], notice: null });
    expect((await two.estela.ops.shipment(marta, "EST-4058"))?.health).toBe("on_time");
    expect(two.estela.demo.events()[0]).toMatchObject({ id: "A", state: "ready" });
  });

  test("a decision taken in a tab left open past six hours lands in the session it was taken in", async () => {
    const storage = fakeBrowserStorage();
    const store = new BrowserEventStore(storage.tab());
    const clock = new DemoClock(
      T0,
      () => store.sessionStartedAt(),
      () => storage.time.now,
    );
    const estela = await createEstela({ clock, store, aiLatencyMs: 0 });
    const { marta, mariana } = personas(estela);

    storage.time.now += 5 * MINUTE;
    await estela.demo.send("A");
    expect((await estela.ops.shipment(marta, "EST-4058"))?.health).toBe("at_risk");

    storage.time.now += 6 * HOUR + MINUTE;
    expect(await approveNotice(estela, marta, "EST-4058")).toMatchObject({ ok: true });

    expect(estela.demo.events()[0]).toMatchObject({ id: "A", state: "sent" });
    expect(estela.now()).toBe(T0 + 6 * HOUR + 6 * MINUTE);
    const ops = await estela.ops.shipment(marta, "EST-4058");
    expect(ops?.messages.map((message) => message.at)).toEqual([estela.now()]);
    expect(ops?.health).not.toBe("on_time");
    expect((await estela.portal.shipment(mariana, "EST-4058"))?.verdict).toBe("delayed");
  });
});
