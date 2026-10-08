"use client";

import { createContext, use } from "react";
import type { Estela } from "@/application/estela";
import type { Actor, ExternalActor, InternalActor } from "@/domain/perimeter";
import type { Instant } from "@/domain/time";

export type Session = {
  estela: Estela;
  actor: Actor;
  /** The demo clock, re-read every half minute and whenever the log changes. */
  now: Instant;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) {
    throw new Error("useSession must be used inside a role layout.");
  }
  return session;
}

/** The session of an operations screen. A customer persona never reaches one: the layout redirects. */
export function useOpsSession(): Session & { actor: InternalActor } {
  const session = useSession();
  if (session.actor.kind !== "internal") {
    throw new Error("An operations screen was rendered for a customer persona.");
  }
  return { ...session, actor: session.actor };
}

export function usePortalSession(): Session & { actor: ExternalActor } {
  const session = useSession();
  if (session.actor.kind !== "external") {
    throw new Error("A portal screen was rendered for an internal persona.");
  }
  return { ...session, actor: session.actor };
}

export function homeOf(actor: Actor): "/ops" | "/portal" {
  return actor.kind === "internal" ? "/ops" : "/portal";
}
