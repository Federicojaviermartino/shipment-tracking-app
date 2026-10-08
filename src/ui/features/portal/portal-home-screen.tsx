"use client";

import { useQuery } from "@tanstack/react-query";
import { portalQueries } from "@/ui/hooks/queries";
import { usePortalSession } from "@/ui/shell/session";
import { NoticeAnnouncer } from "./notice-announcer";
import { PortalHome } from "./portal-home";
import { PortalLoadError } from "./portal-load-error";
import { PortalSkeleton } from "./portal-skeleton";

export function PortalHomeScreen() {
  const { estela, actor, now } = usePortalSession();
  const { data: home, isError, refetch } = useQuery(portalQueries.home(estela, actor));
  const firstName = actor.name.split(" ")[0] ?? actor.name;

  return (
    <>
      {/* Keyed by person: another persona's notices are not news for this one. */}
      <NoticeAnnouncer key={actor.userId} notices={home?.notices} />
      {home ? (
        <PortalHome home={home} firstName={firstName} now={now} />
      ) : isError ? (
        <PortalLoadError onRetry={() => void refetch()} />
      ) : (
        <PortalSkeleton label="Loading your shipments" />
      )}
    </>
  );
}
