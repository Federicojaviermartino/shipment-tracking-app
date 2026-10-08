"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { listHref } from "@/ui/features/ops-shipments/url-state";
import { age } from "@/ui/format/when";
import { opsQueries } from "@/ui/hooks/queries";
import { AskBar } from "./ask-bar";
import { IdentityChip } from "./identity-chip";
import { LiveIndicator } from "./live-indicator";
import { OpsTopBar } from "./ops-top-bar";
import { useOpsSession } from "./session";
import { SkipLink } from "./skip-link";
import { Wordmark } from "./wordmark";

/** The operations chrome around a screen: the top bar with the ask bar, and the main landmark. */
export function OpsFrame({ children }: { children: ReactNode }) {
  const { estela, actor, now } = useOpsSession();
  const router = useRouter();
  const pathname = usePathname();
  const asked = useSearchParams().get("q") ?? "";
  const overview = useQuery(opsQueries.overview(estela, actor));
  // What is being typed; the last question asked comes back from the URL on the list.
  const [typed, setTyped] = useState<{ for: string; text: string }>({ for: asked, text: asked });
  const text = typed.for === asked ? typed.text : asked;

  const lastUpdate = overview.data?.lastOperatorUpdateAt;

  return (
    <>
      <SkipLink />
      <OpsTopBar
        home={
          <Link
            href="/ops"
            aria-label="Estela, shipments"
            className="inline-flex h-7 items-center rounded-sm"
          >
            <Wordmark />
          </Link>
        }
        ask={
          <AskBar
            value={pathname === "/ops" ? text : typed.text}
            onValueChange={(value) => setTyped({ for: asked, text: value })}
            onSubmit={(value) => {
              if (value) router.push(listHref({ view: "all", ask: value }));
            }}
            suggestions={overview.data?.suggestions}
            placeholder='Ask or search: "shipments to France this week running late"'
          />
        }
        live={lastUpdate ? <LiveIndicator lastUpdate={age(lastUpdate, now)} /> : null}
        identity={<IdentityChip name={actor.name} perimeter={overview.data?.identity ?? ""} />}
      />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[100rem] px-5 pt-6 pb-24 outline-hidden xl:px-8"
      >
        {children}
      </main>
    </>
  );
}
