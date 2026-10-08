"use client";

import { clsx } from "clsx";
import { Check, ChevronUp } from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuTrigger } from "@/ui/kit/menu";
import { Spinner } from "@/ui/kit/spinner";
import { Tooltip } from "@/ui/kit/tooltip";
import { demoControl, demoControlSolid } from "./demo-control";

export type DemoEvent = {
  id: string;
  /** Who sends what: "Noray Lines · NORAY ALTAIR delayed at Veracruz". */
  label: string;
  state: "ready" | "sent" | "blocked";
  /** For a blocked event, what has to happen first. */
  reason?: string;
};

type OperatorEventsProps = {
  events: readonly DemoEvent[];
  onSend: (id: string) => void;
  /** The event being delivered, if any. */
  sendingId?: string;
};

/**
 * The scripted operator feed: a button that names the next event it can send, and a menu
 * with all of them and their state. Nothing fires on a timer.
 */
export function OperatorEvents({ events, onSend, sendingId }: OperatorEventsProps) {
  const next = events.find((event) => event.state === "ready");
  const blocked = events.find((event) => event.state === "blocked");
  const sending = sendingId !== undefined;
  const unavailable = next === undefined || sending;

  function handleClick(event: MouseEvent) {
    if (next && !sending) {
      onSend(next.id);
    } else {
      // Cancelled, so that the press does not close the tooltip that says what to do first.
      event.preventDefault();
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (unavailable) {
      event.preventDefault();
    }
  }

  const send = (
    <button
      type="button"
      aria-disabled={unavailable || undefined}
      aria-busy={sending || undefined}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      className={clsx(
        demoControl,
        "min-w-0 rounded-r-none px-2",
        next ? demoControlSolid : "cursor-not-allowed bg-white/15 text-white",
      )}
    >
      {sending && <Spinner size={12} />}
      <span className="truncate">
        {next
          ? `Send: ${next.label}`
          : blocked
            ? `Waiting: ${blocked.label}`
            : "All operator events sent"}
      </span>
    </button>
  );

  return (
    <div className="flex min-w-0">
      {!next && blocked?.reason ? (
        <Tooltip content={blocked.reason} describes>
          {send}
        </Tooltip>
      ) : (
        send
      )}
      <Menu>
        <MenuTrigger
          aria-label="All operator events"
          className={clsx(
            demoControl,
            demoControlSolid,
            "w-7 shrink-0 justify-center rounded-l-none border-l border-ink-900/25",
          )}
        >
          <ChevronUp aria-hidden="true" className="size-3.5" />
        </MenuTrigger>
        <MenuContent side="top" align="end" className="w-112">
          <MenuGroup label="Operator events">
            {events.map((event) =>
              event.state === "ready" ? (
                <MenuItem
                  key={event.id}
                  description="Ready to send"
                  onSelect={() => onSend(event.id)}
                >
                  {event.label}
                </MenuItem>
              ) : (
                <MenuItem
                  key={event.id}
                  disabledReason={event.state === "sent" ? "Sent" : (event.reason ?? "Not yet")}
                  trailing={
                    event.state === "sent" && <Check aria-hidden="true" className="size-4" />
                  }
                >
                  {event.label}
                </MenuItem>
              ),
            )}
          </MenuGroup>
        </MenuContent>
      </Menu>
    </div>
  );
}
