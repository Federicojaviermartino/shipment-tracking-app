import { useSyncExternalStore } from "react";

const KEY = "estela:persona";

// Next.js keeps the layout of a route it navigated away from, hidden but with its state. The
// signed-in persona therefore cannot be component state: operations and the portal each have
// a layout, and both must agree on who is signed in the moment either becomes visible again.
let current: string | null | undefined;
const listeners = new Set<() => void>();

function read(): string | null {
  if (current === undefined) {
    try {
      current = window.sessionStorage.getItem(KEY);
    } catch {
      current = null;
    }
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The persona of this tab. Two windows can hold two personas over the same shared world. */
export function setPersona(id: string) {
  current = id;
  try {
    window.sessionStorage.setItem(KEY, id);
  } catch {
    // A browser that refuses storage keeps the persona for this page only.
  }
  for (const listener of listeners) listener();
}

export function usePersonaId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
