import type { BrowserEventStoreOptions } from "./browser-event-store";

/**
 * A browser's storage as several tabs see it, for tests: one set of values, a wall clock the test
 * moves, and the notification a real browser sends to every tab except the one that wrote. A real
 * browser delivers that notification later, not during the write: `hold` and `deliver` let a
 * test stand in the gap.
 */
export function fakeBrowserStorage(startedAt = 1_800_000_000_000) {
  const values = new Map<string, string>();
  const tabs = new Set<(key: string | null) => void>();
  const time = { now: startedAt };
  let held: (() => void)[] | null = null;

  return {
    values,
    time,
    /** From now on, notifications wait until `deliver` is called. */
    hold(): void {
      held = [];
    },
    deliver(): void {
      const waiting = held ?? [];
      held = null;
      for (const notify of waiting) notify();
    },
    /** Tells every tab that a key was written, whether or not anything changed. */
    announce(key: string): void {
      for (const tab of tabs) tab(key);
    },
    /** The options of a store that lives in a new tab of this browser. */
    tab(): BrowserEventStoreOptions {
      let own: ((key: string | null) => void) | null = null;
      return {
        storage: {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => {
            values.set(key, value);
            for (const tab of tabs) {
              if (tab === own) continue;
              if (held) held.push(() => tab(key));
              else tab(key);
            }
          },
        },
        onExternalChange: (listener) => {
          own = listener;
          tabs.add(listener);
          return () => tabs.delete(listener);
        },
        wallClock: () => time.now,
      };
    },
  };
}
