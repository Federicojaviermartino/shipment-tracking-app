import { clsx } from "clsx";
import { Disclosure, DisclosureContent, DisclosureTrigger } from "./disclosure";

/** One raw operator message, kept verbatim next to the milestone it was translated into. */
export type OriginalMessage = {
  /** The id of the raw message in the log. */
  id: string;
  /** Who sent it: "Noray Lines". */
  source: string;
  /** How it arrived: "API", "CSV file", "Daily report", "Email". */
  channel: string;
  /** When it reached Estela, already formatted with its place: "Tue 22 Sep 08:33 Zaragoza". */
  receivedAt: string;
  /** The payload exactly as the operator sent it. */
  body: string;
  /** The language of the payload when it is prose, as a BCP 47 tag: "es", "de". */
  lang?: string;
};

type OriginalMessagesProps = {
  messages: readonly OriginalMessage[];
  className?: string;
};

export function OriginalMessages({ messages, className }: OriginalMessagesProps) {
  return (
    <ul className={clsx("flex flex-col gap-2", className)}>
      {messages.map((message) => (
        <li key={message.id}>
          <p className="text-xs text-ink-600">
            {message.source} · {message.channel} · received {message.receivedAt}
          </p>
          <pre
            lang={message.lang}
            className="mt-1 rounded-sm bg-sunken px-3 py-2 font-mono text-xs wrap-anywhere whitespace-pre-wrap text-ink-700"
          >
            {message.body}
          </pre>
        </li>
      ))}
    </ul>
  );
}

type ShowOriginalProps = {
  messages: readonly OriginalMessage[];
  defaultOpen?: boolean;
  className?: string;
};

/** "Show original": the operator's own words behind a fact, one click away. */
export function ShowOriginal({ messages, defaultOpen = false, className }: ShowOriginalProps) {
  return (
    <Disclosure defaultOpen={defaultOpen} className={className}>
      <DisclosureTrigger openLabel="Hide original">Show original</DisclosureTrigger>
      <DisclosureContent>
        <OriginalMessages messages={messages} className="mt-1" />
      </DisclosureContent>
    </Disclosure>
  );
}
