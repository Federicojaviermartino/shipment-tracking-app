import { describe, expect, test } from "vitest";
import type { LogView } from "@/application/ports/demo-feed";
import type { LoggedEvent, RawMessage } from "@/domain/log";
import { HOUR, MINUTE } from "@/domain/time";
import { DemoClock, ManualClock } from "./clocks";
import { ScriptedDemoFeed, type ScriptedEvent } from "./scripted-demo-feed";

const T0 = Date.UTC(2026, 9, 7, 14, 0);

describe("clocks", () => {
  test("a manual clock moves only when told", () => {
    const clock = new ManualClock(T0);
    expect(clock.now()).toBe(T0);
    clock.advance(5 * MINUTE);
    expect(clock.now()).toBe(T0 + 5 * MINUTE);
  });

  test("the demo clock is T0 plus the real time since the session started", () => {
    const wall = { now: 1_000_000 };
    const clock = new DemoClock(
      T0,
      () => 1_000_000,
      () => wall.now,
    );
    expect(clock.now()).toBe(T0);
    wall.now += 3 * MINUTE;
    expect(clock.now()).toBe(T0 + 3 * MINUTE);
  });

  test("the demo clock follows a session that restarts, and never runs before T0", () => {
    const session = { startedAt: 1_000_000 };
    const wall = { now: 1_000_000 + HOUR };
    const clock = new DemoClock(
      T0,
      () => session.startedAt,
      () => wall.now,
    );
    expect(clock.now()).toBe(T0 + HOUR);
    session.startedAt = wall.now;
    expect(clock.now()).toBe(T0);
    session.startedAt = wall.now + MINUTE;
    expect(clock.now()).toBe(T0);
  });
});

function message(id: string, now: number): RawMessage {
  return { id, operatorId: "NRY", channel: "api", receivedAt: now, body: `sent at ${now}` };
}

const SCRIPT: ScriptedEvent[] = [
  {
    id: "A",
    label: "Noray Lines · vessel delayed",
    precondition: { kind: "none" },
    messageIds: ["demo-A-1"],
    messages: (now) => [message("demo-A-1", now)],
  },
  {
    id: "B",
    label: "Turia · confirms the date",
    precondition: { kind: "demo_event_sent", id: "A" },
    messageIds: ["demo-B-1", "demo-B-2"],
    messages: (now) => [message("demo-B-1", now), message("demo-B-2", now)],
  },
  {
    id: "C",
    label: "Turia · customs release",
    precondition: { kind: "document_sent", shipmentId: "EST-4012", docType: "commercial_invoice" },
    messageIds: ["demo-C-1"],
    messages: (now) => [message("demo-C-1", now)],
  },
];

function logWith(messageIds: string[], events: LoggedEvent[] = []): LogView {
  return { events: () => events, received: (id) => messageIds.includes(id) };
}

function invoiceSent(shipmentId: string): LoggedEvent {
  return {
    kind: "internal",
    type: "document_sent",
    id: `sent-${shipmentId}`,
    shipmentId,
    at: T0,
    by: "marta.soler",
    exception: "customs_hold",
    docType: "commercial_invoice",
    fileName: "commercial-invoice.pdf",
    to: "TGF",
    subject: "Corrected commercial invoice",
    body: "Attached.",
  };
}

describe("the scripted demo feed", () => {
  const feed = new ScriptedDemoFeed(SCRIPT);
  const states = (log: LogView) => feed.events(log).map((event) => `${event.id}:${event.state}`);

  test("at the start, an event without a precondition is ready and the others say what they wait for", () => {
    expect(feed.events(logWith([]))).toEqual([
      { id: "A", label: "Noray Lines · vessel delayed", state: "ready" },
      {
        id: "B",
        label: "Turia · confirms the date",
        state: "blocked",
        reason: 'Send "vessel delayed" first',
      },
      {
        id: "C",
        label: "Turia · customs release",
        state: "blocked",
        reason: "Send the commercial invoice for EST-4012 first",
      },
    ]);
  });

  test("sent is read from the log: an event is sent once all its messages are there", () => {
    expect(states(logWith(["demo-A-1"]))).toEqual(["A:sent", "B:ready", "C:blocked"]);
    expect(states(logWith(["demo-A-1", "demo-B-1"]))).toEqual(["A:sent", "B:ready", "C:blocked"]);
    expect(states(logWith(["demo-A-1", "demo-B-1", "demo-B-2"]))).toEqual([
      "A:sent",
      "B:sent",
      "C:blocked",
    ]);
  });

  test("a document precondition holds once that document was sent for that shipment", () => {
    expect(states(logWith([], [invoiceSent("EST-4058")]))[2]).toBe("C:blocked");
    expect(states(logWith([], [invoiceSent("EST-4012")]))[2]).toBe("C:ready");
  });

  test("messages are stamped with the moment of sending, and an unknown event has none", () => {
    expect(feed.messages("B", T0 + MINUTE)).toEqual([
      message("demo-B-1", T0 + MINUTE),
      message("demo-B-2", T0 + MINUTE),
    ]);
    expect(feed.messages("Z", T0)).toEqual([]);
  });
});
