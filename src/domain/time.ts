export type Instant = number;
export type LocalDate = string;
export type Zone = "Europe/Madrid" | "Europe/Paris" | "Europe/Berlin" | "America/Mexico_City";
export type Precision = "minute" | "day";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<Zone, Intl.DateTimeFormat>();

function formatterFor(zone: Zone): Intl.DateTimeFormat {
  const cached = formatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(zone, formatter);
  return formatter;
}

function wallClock(instant: Instant, zone: Zone): WallClock {
  const wall: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatterFor(zone).formatToParts(new Date(instant))) {
    if (part.type in wall) wall[part.type as keyof WallClock] = Number(part.value);
  }
  return wall;
}

function offsetAt(instant: Instant, zone: Zone): number {
  const wall = wallClock(instant, zone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Not a local date: "${date}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Not a calendar day: "${date}"`);
  }
  return { year, month, day };
}

function utcMidnight(date: LocalDate): number {
  const { year, month, day } = parseDate(date);
  return Date.UTC(year, month - 1, day);
}

function toLocalDate(utc: number): LocalDate {
  return new Date(utc).toISOString().slice(0, 10);
}

export function localDate(instant: Instant, zone: Zone): LocalDate {
  const wall = wallClock(instant, zone);
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

export function localTime(instant: Instant, zone: Zone): string {
  const wall = wallClock(instant, zone);
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

/**
 * The instant of a wall-clock time in a zone. A time that does not exist (spring forward) resolves
 * to the instant one hour later; a time that happens twice (autumn) resolves to the second one.
 */
export function instantAt(date: LocalDate, time: string, zone: Zone): Instant {
  const { year, month, day } = parseDate(date);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Not a time of day: "${time}"`);
  const wall = Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2]));
  const guess = wall - offsetAt(wall, zone);
  return wall - offsetAt(guess, zone);
}

/**
 * A value known only to the day is stored at 12:00 UTC of that day: it then reads as the same
 * calendar date in every supported zone, so a forwarder in Valencia can report a Veracruz date
 * without anybody having to know whose midnight it meant.
 */
export function dayInstant(date: LocalDate): Instant {
  return utcMidnight(date) + 12 * HOUR;
}

/** The calendar day of a day-precision instant. */
export function dayOf(instant: Instant): LocalDate {
  return toLocalDate(instant);
}

/** Whole days from `from` to `to`; positive when `to` is the later date. */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return toLocalDate(utcMidnight(date) + days * DAY);
}

/** ISO weekday: Monday is 1, Sunday is 7. */
export function weekday(date: LocalDate): number {
  return ((new Date(utcMidnight(date)).getUTCDay() + 6) % 7) + 1;
}

/** Monday to Friday. Public holidays are not modelled: a stated limitation of the prototype. */
export function isWorkingDay(date: LocalDate): boolean {
  return weekday(date) <= 5;
}

export function nextWorkingDay(date: LocalDate): LocalDate {
  let next = addDays(date, 1);
  while (!isWorkingDay(next)) next = addDays(next, 1);
  return next;
}

export function addWorkingDays(date: LocalDate, days: number): LocalDate {
  let result = date;
  for (let step = 0; step < days; step += 1) result = nextWorkingDay(result);
  return result;
}

/** The Monday-to-Sunday week that contains the date. */
export function weekOf(date: LocalDate): { from: LocalDate; to: LocalDate } {
  const from = addDays(date, 1 - weekday(date));
  return { from, to: addDays(from, 6) };
}

export function formatDay(date: LocalDate): string {
  const { month, day } = parseDate(date);
  return `${WEEKDAYS[weekday(date) - 1]} ${day} ${MONTHS[month - 1]}`;
}

/** "Fri 16 Oct 08:25" for a minute, "Fri 16 Oct" for a day: a day never shows a time of day. */
export function formatStamp(at: Instant, precision: Precision, zone: Zone): string {
  const day = formatDay(localDate(at, zone));
  return precision === "day" ? day : `${day} ${localTime(at, zone)}`;
}

/**
 * Whether a moment is already behind `now`. A day has no time of day, so it is never compared as
 * an instant: it is past once that day is over at the place.
 */
export function isPast(at: Instant, precision: Precision, now: Instant, zone: Zone): boolean {
  if (precision === "minute") return at < now;
  return localDate(at, zone) < localDate(now, zone);
}

export function isoWithOffset(instant: Instant, zone: Zone): string {
  const wall = wallClock(instant, zone);
  const offsetMinutes = Math.round(offsetAt(instant, zone) / MINUTE);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  const date = `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
  return `${date}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}${offset}`;
}
