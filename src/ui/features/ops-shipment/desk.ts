import type { WhenView } from "@/application/views";
import { DESK_ZONE } from "@/domain/filters";
import { formatDay, type Instant, isoWithOffset, localDate, localTime } from "@/domain/time";

/**
 * Where the desk reads the clock. A timeline row keeps the local time of its own place, so
 * anything told in the desk's time names the desk beside it.
 */
export const DESK_PLACE = "Zaragoza";

/** A moment as the desk lived it: when a message came in, when one of us acted. */
export function deskTime(at: Instant): WhenView {
  return { at, precision: "minute", zone: DESK_ZONE };
}

/** The same moment as text, for the kit props that take a formatted stamp. */
export function deskStamp(at: Instant): string {
  const day = localDate(at, DESK_ZONE);
  return `${formatDay(day)} ${localTime(at, DESK_ZONE)} ${DESK_PLACE}`;
}

/** The clock of the "Now" rule. */
export function deskClock(now: Instant) {
  return {
    day: formatDay(localDate(now, DESK_ZONE)),
    time: localTime(now, DESK_ZONE),
    place: DESK_PLACE,
    dateTime: isoWithOffset(now, DESK_ZONE),
  };
}

/** The day of that moment, for "declared Tue 6 Oct". */
export function deskDay(at: Instant): WhenView {
  return { at, precision: "day", zone: DESK_ZONE };
}
