import { dayInstant, instantAt, type Instant, type LocalDate, type Zone } from "@/domain/time";

export const MADRID: Zone = "Europe/Madrid";
export const PARIS: Zone = "Europe/Paris";
export const MEXICO: Zone = "America/Mexico_City";

/**
 * A wall-clock time at a place, written out in full so that every date in the fixtures can be
 * checked against the calendar by reading it: `at("2026-09-22 08:25", MADRID)`.
 */
export function at(local: string, zone: Zone): Instant {
  const [date, time] = local.split(" ");
  if (!date || !time) throw new RangeError(`Expected "YYYY-MM-DD HH:mm", got "${local}"`);
  return instantAt(date, time, zone);
}

/** A date known only to the day, as forwarders report them. */
export function day(date: LocalDate): Instant {
  return dayInstant(date);
}

/**
 * The demo world is frozen at Wednesday 7 October 2026, 16:00 in Madrid (08:00 in Veracruz), and
 * runs in real time from there. A fixed weekday afternoon is deliberate: trucks, offices and
 * customs do not work weekends, and a load-time clock would produce Saturday deliveries.
 */
export const T0: Instant = at("2026-10-07 16:00", MADRID);
