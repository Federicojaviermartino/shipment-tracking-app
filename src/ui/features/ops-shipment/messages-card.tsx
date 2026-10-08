"use client";

import { Paperclip } from "lucide-react";
import { useId } from "react";
import type { SentMessageView } from "@/application/views";
import { dateValue } from "@/ui/format/when";
import { Card } from "@/ui/kit/card";
import { DateText } from "@/ui/kit/date-stamp";
import { Disclosure, DisclosureContent, DisclosureTrigger } from "@/ui/kit/disclosure";
import { DESK_PLACE, deskTime } from "./desk";

/** What left the desk about this shipment: to whom, approved by whom, and when. */
export function MessagesCard({ messages }: { messages: readonly SentMessageView[] }) {
  const titleId = useId();

  return (
    <Card as="section" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-lg font-semibold">
        Messages sent
      </h2>
      {messages.length === 0 ? (
        <p className="mt-2 text-ink-600">Nothing has been sent about this shipment.</p>
      ) : (
        <ul className="mt-2">
          {messages.map((message) => (
            <li key={message.id} className="border-t border-line py-2 first:border-t-0 last:pb-0">
              <p className="font-medium">{message.subject}</p>
              <p className="text-xs text-ink-600">
                To {message.to} · {message.by} · <DateText {...dateValue(deskTime(message.at))} />{" "}
                {DESK_PLACE}
              </p>
              {message.attachment && (
                <p className="mt-1 flex items-center gap-1.5 text-xs">
                  <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-ink-500" />
                  <span className="min-w-0 truncate font-mono">{message.attachment}</span>
                </p>
              )}
              <Disclosure>
                <DisclosureTrigger openLabel="Hide message">Show message</DisclosureTrigger>
                <DisclosureContent>
                  <p className="rounded-sm bg-canvas px-3 py-2 text-xs/5 whitespace-pre-line">
                    {message.body}
                  </p>
                </DisclosureContent>
              </Disclosure>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
