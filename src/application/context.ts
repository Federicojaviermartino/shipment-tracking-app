import type { RawMessage } from "@/domain/log";
import type { Instant } from "@/domain/time";
import type { Directory } from "./directory";

/** What every view and sentence is built against: the names, the instant and the raw messages. */
export type ReadContext = {
  directory: Directory;
  now: Instant;
  rawOf(id: string): RawMessage | undefined;
};
