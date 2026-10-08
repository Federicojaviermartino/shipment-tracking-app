import type { Instant } from "@/domain/time";
import { age } from "@/ui/format/when";

type LastUpdateProps = {
  at: Instant | null;
  now: Instant;
  className?: string;
};

/** How fresh the record is, as an age: a customer is never told that a shipment has gone quiet. */
export function LastUpdate({ at, now, className }: LastUpdateProps) {
  return (
    <p className={className}>
      {at === null ? "No confirmed update yet" : `Last confirmed update ${age(at, now)}`}
    </p>
  );
}
