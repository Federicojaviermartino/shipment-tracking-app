"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { portalQueries } from "@/ui/hooks/queries";
import { PortalTopBar } from "./portal-top-bar";
import { usePortalSession } from "./session";
import { SkipLink } from "./skip-link";
import { Wordmark } from "./wordmark";

const SHIPPER = "Ibón Fluid Systems";

/** The portal chrome: one centred column, no navigation, because the list is the home. */
export function PortalFrame({ children }: { children: ReactNode }) {
  const { estela, actor } = usePortalSession();
  const home = useQuery(portalQueries.home(estela, actor));

  return (
    <>
      <SkipLink />
      <PortalTopBar
        home={
          <Link
            href="/portal"
            aria-label="Estela, your shipments"
            className="inline-flex h-7 items-center rounded-sm"
          >
            <Wordmark />
          </Link>
        }
        shipper={SHIPPER}
        account={home.data?.account.name ?? ""}
        person={actor.name}
      />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-portal px-5 pt-10 pb-28 outline-hidden xl:px-8"
      >
        {children}
      </main>
    </>
  );
}
