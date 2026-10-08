import type { ReactNode } from "react";
import { Legend } from "./legend";

type OpsTopBarProps = {
  /** The wordmark inside a link to the operations home. */
  home: ReactNode;
  /** The ask bar. */
  ask: ReactNode;
  /** The live indicator. */
  live: ReactNode;
  /** The identity chip of the signed-in persona. */
  identity: ReactNode;
};

/** The operations chrome: 56px, sticky, with no navigation because there is one list. */
export function OpsTopBar({ home, ask, live, identity }: OpsTopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-6 border-b border-line bg-surface px-5 xl:px-8">
      <div className="shrink-0">{home}</div>
      <div className="flex min-w-0 flex-1 justify-center">{ask}</div>
      <div className="flex shrink-0 items-center gap-4">
        <Legend />
        {live}
        {identity}
      </div>
    </header>
  );
}
