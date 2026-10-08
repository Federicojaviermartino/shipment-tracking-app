"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, use, useEffect, useMemo, useState } from "react";
import { browser } from "react-dom";
import type { Estela } from "@/application/estela";
import type { FeedNotice } from "@/application/views";
import { createBrowserEstela } from "@/composition/create-estela";
import { DESK_ZONE } from "@/domain/filters";
import type { Actor } from "@/domain/perimeter";
import { formatDay, type Instant, localDate, localTime } from "@/domain/time";
import { listHref } from "@/ui/features/ops-shipments/url-state";
import { ToastProvider, ToastViewport, useToast } from "@/ui/kit/toast";
import { TooltipProvider } from "@/ui/kit/tooltip";
import { DemoBar } from "./demo-bar";
import { setPersona, usePersonaId } from "./persona-store";
import { homeOf, SessionContext } from "./session";

type Side = "operations" | "customer";

const CLOCK_TICK_MS = 30_000;

// One gateway and one query cache per page load. Both live in the browser only: the
// prototype has no server state, so there is nothing to render before this point.
let estela: Promise<Estela> | undefined;
let queries: QueryClient | undefined;

function useDemoClock(gateway: Estela): Instant {
  const [now, setNow] = useState(() => gateway.now());
  useEffect(() => {
    const tick = () => setNow(gateway.now());
    const timer = window.setInterval(tick, CLOCK_TICK_MS);
    const unsubscribe = gateway.demo.subscribe(tick);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [gateway]);
  return now;
}

function feedToast(notice: FeedNotice) {
  const title = `${notice.operatorName}: ${notice.headline}`;
  const rest = notice.text.startsWith(title) ? notice.text.slice(title.length + 1).trim() : "";
  return { title, description: rest || undefined };
}

/**
 * Keeps the screens honest about freshness. The gateway only says that something changed; every
 * query is then asked again through the same scoped calls, exactly as it would be behind
 * server-sent events.
 */
function useLiveUpdates(gateway: Estela, actor: Actor) {
  const client = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  useEffect(() => gateway.demo.subscribe(() => void client.invalidateQueries()), [gateway, client]);

  useEffect(
    () =>
      gateway.subscribe(actor, ({ notice }) => {
        if (!notice) return;
        const filter = notice.filter;
        toast.show({
          ...feedToast(notice),
          action: filter
            ? { label: "View", onSelect: () => router.push(listHref({ view: "all", filter })) }
            : undefined,
        });
      }),
    [gateway, actor, toast, router],
  );
}

function demoClock(now: Instant): string {
  const day = localDate(now, DESK_ZONE);
  return `${formatDay(day)} ${day.slice(0, 4)} ${localTime(now, DESK_ZONE)} · Zaragoza`;
}

function Signed({ gateway, side, children }: { gateway: Estela; side: Side; children: ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const personas = useMemo(() => gateway.demo.personas(), [gateway]);
  const personaId = usePersonaId();
  const [sendingId, setSendingId] = useState<string>();
  const now = useDemoClock(gateway);

  const persona = personas.find((candidate) => candidate.actor.userId === personaId) ?? personas[0];
  if (!persona) {
    throw new Error("The demo world has no personas.");
  }
  const { actor } = persona;
  const misplaced = persona.side !== side;

  useEffect(() => {
    if (misplaced) router.replace(homeOf(actor));
  }, [misplaced, actor, router]);

  useLiveUpdates(gateway, actor);

  const session = useMemo(() => ({ estela: gateway, actor, now }), [gateway, actor, now]);

  function changePersona(id: string) {
    const next = personas.find((candidate) => candidate.actor.userId === id);
    if (!next) return;
    setPersona(id);
    // Same side, same URL: that is how a reviewer sees a perimeter turn a shipment into "not found".
    if (next.side !== side) router.push(homeOf(next.actor));
  }

  async function sendEvent(id: string) {
    setSendingId(id);
    try {
      await gateway.demo.send(id);
    } finally {
      setSendingId(undefined);
    }
  }

  function reset() {
    gateway.demo.reset();
    void client.invalidateQueries();
    toast.show({ title: "Demo reset", description: "The world is back at Wed 7 Oct, 16:00." });
  }

  return (
    <SessionContext value={session}>
      {misplaced ? null : children}
      <ToastViewport />
      <DemoBar
        personas={personas.map((candidate) => ({
          id: candidate.actor.userId,
          name: candidate.actor.name,
          title: candidate.actor.title,
          perimeter: candidate.perimeter,
          side: candidate.side,
        }))}
        activePersonaId={actor.userId}
        onPersonaChange={changePersona}
        events={gateway.demo.events()}
        onSendEvent={(id) => void sendEvent(id)}
        sendingEventId={sendingId}
        clock={demoClock(now)}
        onReset={reset}
      />
    </SessionContext>
  );
}

/**
 * What a role layout mounts: the gateway, the query cache, the signed-in persona, toasts and the
 * demo bar. Everything under it renders in the browser only, behind the layout's Suspense
 * boundary, so no date is ever rendered on a server with a clock of its own.
 */
export function Workspace({ side, children }: { side: Side; children: ReactNode }) {
  use(browser("Estela keeps its data in the browser: the page is rendered there."));
  const gateway = use((estela ??= createBrowserEstela()));
  queries ??= new QueryClient({
    defaultOptions: {
      // Clocks and staleness move with time even when no event arrives.
      queries: {
        staleTime: 15_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queries}>
      <TooltipProvider>
        <ToastProvider>
          <Signed gateway={gateway} side={side}>
            {children}
          </Signed>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
