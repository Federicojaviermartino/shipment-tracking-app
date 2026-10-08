import type { RawMessageView } from "@/application/views";
import type { OriginalMessage } from "@/ui/kit/show-original";
import { deskStamp } from "./desk";

/** An operator's raw message as "Show original" takes it. */
export function originalMessage(raw: RawMessageView): OriginalMessage {
  return {
    id: raw.id,
    source: raw.source,
    channel: raw.channelLabel,
    receivedAt: deskStamp(raw.receivedAt),
    body: raw.body,
  };
}

/** The messages that exist, in the order given: a source may have none on file. */
export function originalMessages(raws: readonly (RawMessageView | null)[]): OriginalMessage[] {
  return raws.flatMap((raw) => (raw ? [originalMessage(raw)] : []));
}
