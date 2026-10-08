"use client";

import { clsx } from "clsx";
import { besideDrawer } from "@/ui/kit/beside-drawer";
import { demoControl, demoControlQuiet } from "./demo-control";
import { type DemoEvent, OperatorEvents } from "./operator-events";
import { type DemoPersona, PersonaMenu } from "./persona-menu";

type DemoBarProps = {
  personas: readonly DemoPersona[];
  activePersonaId: string;
  onPersonaChange: (id: string) => void;
  events: readonly DemoEvent[];
  onSendEvent: (id: string) => void;
  sendingEventId?: string;
  /** The demo clock, already formatted: "Wed 7 Oct 2026 16:03 · Zaragoza". */
  clock: string;
  onReset: () => void;
  className?: string;
};

/**
 * The demo controls: fixed to the bottom edge and the only inverse surface, so that they
 * read as tooling outside the product. Render it last in the document: it is the last
 * stop in tab order, and pages leave `pb-demobar` free for it. It stays usable while a
 * drawer is open, because that is the only way to change the world under an open draft.
 */
export function DemoBar({
  personas,
  activePersonaId,
  onPersonaChange,
  events,
  onSendEvent,
  sendingEventId,
  clock,
  onReset,
  className,
}: DemoBarProps) {
  return (
    <section
      {...besideDrawer}
      aria-label="Demo controls"
      className={clsx(
        "pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex h-demobar items-center gap-3 bg-ink-900 px-4 font-mono text-xs text-white [--focus-color:var(--color-brand-200)]",
        className,
      )}
    >
      <span className="font-medium tracking-wider text-ink-400">DEMO</span>
      <PersonaMenu personas={personas} activeId={activePersonaId} onChange={onPersonaChange} />
      <OperatorEvents events={events} onSend={onSendEvent} sendingId={sendingEventId} />
      <p className="ml-auto shrink-0 text-ink-400">
        <span className="max-lg:hidden">Demo clock · </span>
        <span className="text-white tabular-nums">{clock}</span>
      </p>
      <button
        type="button"
        onClick={onReset}
        className={clsx(demoControl, demoControlQuiet, "shrink-0 px-2")}
      >
        Reset
      </button>
    </section>
  );
}
