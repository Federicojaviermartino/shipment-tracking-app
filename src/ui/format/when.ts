import type { WhenView } from "@/application/views";
import {
  DAY,
  formatDay,
  HOUR,
  type Instant,
  isoWithOffset,
  type LocalDate,
  localDate,
  localTime,
  MINUTE,
} from "@/domain/time";
import type { DateValue } from "@/ui/kit/date-stamp";

/** A moment at a place, as the date stamp takes it: always in the local time of that place. */
export function dateValue(when: WhenView): DateValue {
  const day = localDate(when.at, when.zone);
  if (when.precision === "day") {
    return { day: formatDay(day), precision: "day", dateTime: day };
  }
  return {
    day: formatDay(day),
    time: localTime(when.at, when.zone),
    precision: "minute",
    dateTime: isoWithOffset(when.at, when.zone),
  };
}

/** A calendar day at the destination: a committed date, a window edge. */
export function dayValue(day: LocalDate): DateValue {
  return { day: formatDay(day), precision: "day", dateTime: day };
}

/** How long ago something reached us: "just now", "25 min ago", "27 h ago", "6 d ago". */
export function age(at: Instant, now: Instant): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < 2 * DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  return `${Math.floor(elapsed / DAY)} d ago`;
}

/** The difference with the committed date, for the small figure next to a date: "+1 d", "−2 d". */
export function lateBy(days: number): string | null {
  if (days === 0) return null;
  return days > 0 ? `+${days} d` : `−${-days} d`;
}
