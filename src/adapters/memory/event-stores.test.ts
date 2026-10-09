import { describe, expect, test } from "vitest";
import type { Batch, EventStore } from "@/application/ports/event-store";
import type { Fact, LoggedEvent, NoticeSent, RawMessage } from "@/domain/log";
import { HOUR, MINUTE } from "@/domain/time";
import { BrowserEventStore, DEFAULT_SESSION_KEY, MAX_SESSION_AGE } from "./browser-event-store";
import { InMemoryEventStore } from "./in-memory-event-store";
import { SESSION_VERSION } from "./stored-session";
import { fakeBrowserStorage } from "./test-support";

function notice(id: string, shipmentId = "EST-1"): NoticeSent {
  return {
    kind: "internal",
    type: "notice_sent",
    id,
    shipmentId,
    at: 1_000,
    by: "marta.soler",
    exception: "delay",
    subject: "Order 70001: delivery moved",
    body: "The delivery date has changed.",
    published: null,
  };
}

function operatorEvent(key: string): LoggedEvent {
  return {
    kind: "operator",
    key,
    shipmentId: "EST-1",
    source: "CRZ",
    rawId: `raw-${key}`,
    fact: { type: "note", text: "A remark" },
    occurredAt: 500,
    precision: "minute",
    receivedAt: 600,
    reading: { method: "table", rule: "test" },
  };
}

function raw(id: string): RawMessage {
  return { id, operatorId: "CRZ", channel: "csv", receivedAt: 600, body: `body of ${id}` };
}

const SEED: Batch = { raws: [raw("raw-seed")], events: [operatorEvent("seed")] };

/** A tab of the fake browser, seeded as every tab is at start-up. */
function fakeBrowser(startedAt?: number) {
  const browser = fakeBrowserStorage(startedAt);
  return {
    ...browser,
    openTab(seeded = true): BrowserEventStore {
      const store = new BrowserEventStore(browser.tab());
      if (seeded) store.seed(SEED);
      return store;
    },
  };
}

function countChanges(store: EventStore): () => number {
  let changes = 0;
  store.subscribe(() => {
    changes += 1;
  });
  return () => changes;
}

describe.each([
  ["InMemoryEventStore", (): EventStore => new InMemoryEventStore()],
  ["BrowserEventStore", (): EventStore => fakeBrowser().openTab(false)],
])("%s as an event store", (_, create) => {
  test("appending is idempotent on the identity of an event and of a raw message", () => {
    const store = create();
    store.seed(SEED);
    const batch: Batch = { raws: [raw("raw-a")], events: [operatorEvent("a"), notice("n-1")] };
    store.append(batch);
    const logged = store.events();
    store.append(batch);
    store.append({ events: [{ ...notice("n-1"), subject: "Sent again" }] });
    expect(store.events()).toBe(logged);
    expect(
      store.events().map((event) => (event.kind === "operator" ? event.key : event.id)),
    ).toEqual(["seed", "a", "n-1"]);
    expect(store.raw("raw-a")?.body).toBe("body of raw-a");
  });

  test("an event that is already in the seed is not appended again", () => {
    const store = create();
    store.seed(SEED);
    const changes = countChanges(store);
    store.append({ events: [operatorEvent("seed")] });
    expect(store.events()).toHaveLength(1);
    expect(changes()).toBe(0);
  });

  test("subscribers hear about an append that changed something, and stop when they unsubscribe", () => {
    const store = create();
    let heard = 0;
    const unsubscribe = store.subscribe(() => {
      heard += 1;
    });
    store.append({ events: [notice("n-1")] });
    store.append({ events: [notice("n-1")] });
    expect(heard).toBe(1);
    unsubscribe();
    store.append({ events: [notice("n-2")] });
    expect(heard).toBe(1);
  });

  test("the list of events is the same array until the log changes", () => {
    const store = create();
    store.seed(SEED);
    const first = store.events();
    expect(store.events()).toBe(first);
    store.append({ events: [notice("n-1")] });
    expect(store.events()).not.toBe(first);
  });

  test("reset drops what was appended and keeps the seed", () => {
    const store = create();
    store.seed(SEED);
    store.append({ raws: [raw("raw-a")], events: [operatorEvent("a")] });
    const changes = countChanges(store);
    store.reset();
    expect(store.events().map((event) => event.kind === "operator" && event.key)).toEqual(["seed"]);
    expect(store.raw("raw-a")).toBeUndefined();
    expect(store.raw("raw-seed")).toBeDefined();
    expect(changes()).toBe(1);
  });

  test("messages that produced nothing are kept apart, once each", () => {
    const store = create();
    const rejected = { rawId: "raw-x", reason: "quarantined" as const, detail: "not JSON" };
    store.append({ raws: [raw("raw-x")], events: [], unprocessed: [rejected] });
    store.append({ raws: [raw("raw-x")], events: [], unprocessed: [rejected] });
    expect(store.unprocessed()).toEqual([rejected]);
    expect(store.events()).toEqual([]);
  });
});

describe("BrowserEventStore: persistence", () => {
  test("appended events survive a new store instance, as after a reload", () => {
    const browser = fakeBrowser();
    const first = browser.openTab();
    first.append({ raws: [raw("raw-a")], events: [operatorEvent("a"), notice("n-1")] });

    const reloaded = browser.openTab();
    expect(reloaded.events()).toEqual(first.events());
    expect(reloaded.raw("raw-a")).toEqual(raw("raw-a"));
    expect(reloaded.sessionStartedAt()).toBe(first.sessionStartedAt());
  });

  test("the seed is never written to storage", () => {
    const browser = fakeBrowser();
    const store = browser.openTab();
    store.append({ events: [notice("n-1")] });
    const stored = browser.values.get(DEFAULT_SESSION_KEY) ?? "";
    expect(stored).toContain("n-1");
    expect(stored).not.toContain("raw-seed");
    expect(JSON.parse(stored)).toMatchObject({ version: SESSION_VERSION, events: [{ id: "n-1" }] });
  });

  test("a second instance receives what the first appends, after the storage notification", () => {
    const browser = fakeBrowser();
    const operations = browser.openTab();
    const portal = browser.openTab();
    const changes = countChanges(portal);

    operations.append({ events: [notice("n-1")] });
    expect(portal.events().map((event) => event.kind !== "operator" && event.id)).toEqual([
      false,
      "n-1",
    ]);
    expect(changes()).toBe(1);
  });

  test("two tabs that append one after the other both keep both events", () => {
    const browser = fakeBrowser();
    const one = browser.openTab();
    const two = browser.openTab();
    one.append({ events: [notice("n-1")] });
    two.append({ events: [notice("n-2")] });
    expect(one.events()).toHaveLength(3);
    expect(two.events()).toEqual(one.events());
  });

  test("an append made before the other tab's notification arrives does not overwrite what that tab wrote", () => {
    const browser = fakeBrowser();
    const one = browser.openTab();
    const two = browser.openTab();
    // A browser delivers the storage event later: both tabs write inside that gap.
    browser.hold();
    one.append({ events: [notice("n-1")] });
    two.append({ events: [notice("n-2")] });
    expect(JSON.parse(browser.values.get(DEFAULT_SESSION_KEY) ?? "{}")).toMatchObject({
      events: [{ id: "n-1" }, { id: "n-2" }],
    });
    browser.deliver();
    expect(one.events()).toHaveLength(3);
    expect(two.events()).toEqual(one.events());
  });

  test("a notification that brings nothing new is not announced, and the log keeps its identity", () => {
    const browser = fakeBrowser();
    const one = browser.openTab();
    const two = browser.openTab();
    one.append({ events: [notice("n-1")] });
    const changes = countChanges(two);
    const logged = two.events();
    browser.announce(DEFAULT_SESSION_KEY);
    expect(changes()).toBe(0);
    expect(two.events()).toBe(logged);
  });

  test("the session start is shared, so every tab shows the same demo clock", () => {
    const browser = fakeBrowser();
    const one = browser.openTab();
    browser.time.now += 20 * MINUTE;
    const two = browser.openTab();
    expect(two.sessionStartedAt()).toBe(one.sessionStartedAt());
  });

  test("a session older than six hours resets itself", () => {
    const browser = fakeBrowser();
    const first = browser.openTab();
    first.append({ events: [notice("n-1")] });

    browser.time.now += MAX_SESSION_AGE - MINUTE;
    expect(browser.openTab().events()).toHaveLength(2);

    browser.time.now += HOUR;
    const expired = browser.openTab();
    expect(expired.events().map((event) => event.kind === "operator" && event.key)).toEqual([
      "seed",
    ]);
    expect(expired.sessionStartedAt()).toBe(browser.time.now);
  });

  test("expiry is a rule of loading: a tab that outlives six hours goes on in its own session", () => {
    const browser = fakeBrowser();
    const tab = browser.openTab();
    tab.append({ events: [notice("n-1")] });
    const started = tab.sessionStartedAt();

    browser.time.now += MAX_SESSION_AGE + MINUTE;
    tab.append({ events: [notice("n-2")] });
    expect(tab.events().map((event) => event.kind !== "operator" && event.id)).toEqual([
      false,
      "n-1",
      "n-2",
    ]);
    expect(tab.sessionStartedAt()).toBe(started);

    // Hearing about its own key does not expire it either.
    browser.announce(DEFAULT_SESSION_KEY);
    expect(tab.events()).toHaveLength(3);
    expect(tab.sessionStartedAt()).toBe(started);
  });

  test("a tab opened after the session expired starts a new one, and the old tab follows it whole", () => {
    const browser = fakeBrowser();
    const old = browser.openTab();
    old.append({ events: [notice("n-1")] });
    const changes = countChanges(old);

    browser.time.now += MAX_SESSION_AGE + MINUTE;
    const fresh = browser.openTab();
    expect(fresh.events()).toHaveLength(1);
    expect(old.events()).toHaveLength(1);
    expect(old.sessionStartedAt()).toBe(fresh.sessionStartedAt());
    expect(changes()).toBe(1);
  });

  test("a session dated in the future resets itself", () => {
    const browser = fakeBrowser();
    browser.openTab().append({ events: [notice("n-1")] });

    browser.time.now -= MINUTE;
    const store = browser.openTab();
    expect(store.events()).toHaveLength(1);
    expect(store.sessionStartedAt()).toBe(browser.time.now);
  });

  test("a session written by another version of the log resets itself", () => {
    const browser = fakeBrowser();
    browser.values.set(
      DEFAULT_SESSION_KEY,
      JSON.stringify({
        version: SESSION_VERSION + 1,
        startedAt: browser.time.now,
        raws: [],
        events: [notice("n-1")],
        unprocessed: [],
      }),
    );
    const store = browser.openTab();
    expect(store.events()).toHaveLength(1);
    expect(JSON.parse(browser.values.get(DEFAULT_SESSION_KEY) ?? "{}")).toMatchObject({
      version: SESSION_VERSION,
      events: [],
    });
  });

  test("storage that holds something unreadable is treated as no session at all", () => {
    const browser = fakeBrowser();
    browser.values.set(DEFAULT_SESSION_KEY, "{not json");
    expect(browser.openTab().events()).toHaveLength(1);
    browser.values.set(DEFAULT_SESSION_KEY, JSON.stringify({ version: SESSION_VERSION }));
    expect(browser.openTab().events()).toHaveLength(1);
  });

  test.each([
    ["an operator event without its fact", { ...operatorEvent("old"), fact: undefined }],
    ["a fact of a type the log does not have", { ...operatorEvent("old"), fact: { type: "eta" } }],
    ["an internal event of an unknown type", { ...notice("n-1"), type: "notice_drafted" }],
    ["something that is not an event", "n-1"],
  ])("a stored session holding %s is not trusted: it resets itself", (_, event) => {
    const browser = fakeBrowser();
    browser.values.set(
      DEFAULT_SESSION_KEY,
      JSON.stringify({
        version: SESSION_VERSION,
        startedAt: browser.time.now,
        raws: [],
        events: [notice("n-0"), event],
        unprocessed: [],
      }),
    );
    const store = browser.openTab();
    expect(store.events().map((logged) => logged.kind === "operator" && logged.key)).toEqual([
      "seed",
    ]);
    expect(JSON.parse(browser.values.get(DEFAULT_SESSION_KEY) ?? "{}")).toMatchObject({
      events: [],
    });
  });

  test("every kind of logged event survives a reload unchanged", () => {
    const browser = fakeBrowser();
    const first = browser.openTab();
    const internal = {
      kind: "internal",
      shipmentId: "EST-1",
      at: 2_000,
      by: "marta.soler",
    } as const;
    const place = { name: "Veracruz", country: "MX", zone: "America/Mexico_City" } as const;
    const facts: Fact[] = [
      { type: "milestone", code: "DISCHARGED", place: { ...place, locode: "MXVER" } },
      { type: "estimate", code: "DELIVERED", place, at: 9_000, precision: "day", remark: "ETA" },
      { type: "estimate_withdrawn", code: "DELIVERED", place },
      {
        type: "hold",
        hold: "customs",
        state: "raised",
        reason: "Invoice value",
        requires: "commercial_invoice",
      },
      { type: "position", place: "AP-7 km 512" },
    ];
    const events: LoggedEvent[] = [
      ...facts.map((fact, index) => ({
        ...operatorEvent(`fact-${index}`),
        fact,
        reading: { method: "ai", rule: "test" } as const,
      })),
      {
        ...notice("n-1"),
        published: { day: "2026-10-16", at: 9_000, precision: "day", basis: "estela_estimate" },
      },
      { ...internal, id: "r-1", type: "reading_reviewed", eventKey: "fact-3", accepted: false },
      {
        ...internal,
        id: "c-1",
        type: "operator_contacted",
        exception: "stale",
        operatorId: "CRZ",
        subject: "Status?",
        body: "Where is it?",
      },
      {
        ...internal,
        id: "d-1",
        type: "document_sent",
        exception: "customs_hold",
        docType: "commercial_invoice",
        fileName: "invoice.pdf",
        to: "TGF",
        subject: "Invoice",
        body: "Attached.",
      },
      {
        kind: "document",
        id: "doc-1",
        shipmentId: "EST-1",
        at: 3_000,
        source: "IBON",
        rawId: "raw-a",
        docType: "cmr",
        fileName: "cmr.pdf",
        customerVisible: true,
      },
    ];
    const rejected = { rawId: "raw-x", reason: "orphan" as const, detail: "unknown reference" };
    first.append({ raws: [raw("raw-a")], events, unprocessed: [rejected] });

    const reloaded = browser.openTab();
    expect(reloaded.events().slice(1)).toEqual(events);
    expect(reloaded.raw("raw-a")).toEqual(raw("raw-a"));
    expect(reloaded.unprocessed()).toEqual([rejected]);
  });

  test("an append that adds nothing still announces what it pulled from another tab", () => {
    const browser = fakeBrowser();
    const one = browser.openTab();
    const two = browser.openTab();
    const changes = countChanges(two);
    // Both tabs append the same event before the storage notification of the first arrives.
    browser.hold();
    one.append({ events: [notice("n-1")] });
    two.append({ events: [notice("n-1")] });
    expect(two.events()).toHaveLength(2);
    expect(changes()).toBe(1);
    browser.deliver();
    expect(changes()).toBe(1);
  });

  test("reset clears the stored session and starts a new one in every tab", () => {
    const browser = fakeBrowser();
    const one = browser.openTab();
    const two = browser.openTab();
    one.append({ raws: [raw("raw-a")], events: [notice("n-1")] });
    const changes = countChanges(two);

    browser.time.now += 30 * MINUTE;
    one.reset();
    expect(one.events()).toHaveLength(1);
    expect(two.events()).toHaveLength(1);
    expect(two.raw("raw-a")).toBeUndefined();
    expect(changes()).toBe(1);
    expect(one.sessionStartedAt()).toBe(browser.time.now);
    expect(two.sessionStartedAt()).toBe(browser.time.now);
    expect(browser.openTab().events()).toHaveLength(1);
  });

  test("a write that fails leaves the session working in memory", () => {
    const store = new BrowserEventStore({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      onExternalChange: () => () => undefined,
      wallClock: () => 1_000,
    });
    store.append({ events: [notice("n-1")] });
    expect(store.events()).toHaveLength(1);
  });

  test("a notification about some other key is ignored", () => {
    const listeners: ((key: string | null) => void)[] = [];
    const store = new BrowserEventStore({
      storage: { getItem: () => null, setItem: () => undefined },
      onExternalChange: (listener) => {
        listeners.push(listener);
        return () => undefined;
      },
      wallClock: () => 1_000,
    });
    const changes = countChanges(store);
    listeners[0]?.("some-other-key");
    expect(changes()).toBe(0);
    listeners[0]?.(DEFAULT_SESSION_KEY);
    expect(changes()).toBe(1);
  });
});
