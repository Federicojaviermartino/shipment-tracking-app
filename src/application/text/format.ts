import type { Channel } from "@/domain/log";
import type { MilestoneCode } from "@/domain/shipment";
import { MILESTONE_LABEL, plural } from "@/domain/labels";
import {
  addDays,
  DAY,
  formatDay,
  formatStamp,
  HOUR,
  MINUTE,
  type Instant,
  type LocalDate,
  type Precision,
  type Zone,
} from "@/domain/time";

/** Small, shared pieces of wording. Every sentence the application composes is built from these. */

const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** A small count inside a sentence is spelled out: "one", "two", "11". */
export function spelled(count: number): string {
  return SMALL_NUMBERS[count] ?? String(count);
}

/** "one day", "two days", "11 days". */
export function days(count: number): string {
  return `${spelled(count)} day${count === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b and c". */
export function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A phrase that may or may not end a sentence already, ready to be followed by a full stop. */
export function withoutFullStop(text: string): string {
  return text.trim().replace(/\.$/, "");
}

export function stamp(when: { at: Instant; precision: Precision; zone: Zone }): string {
  return formatStamp(when.at, when.precision, when.zone);
}

/** "today", "tomorrow", "yesterday" or the day itself. */
export function relativeDay(day: LocalDate, today: LocalDate): string {
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  if (day === addDays(today, -1)) return "yesterday";
  return formatDay(day);
}

/** Time left, rounded down: a desk must never read more time than it has. */
export function timeLeft(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))} min`;
  if (ms < 2 * DAY) return `${Math.floor(ms / HOUR)} h`;
  return plural(Math.floor(ms / DAY), "day");
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  csv: "CSV file",
  webhook: "Webhook",
  api: "API",
  report: "Daily report",
  email: "Email",
};

/** What a message that arrived over a channel is called in a sentence. */
export const CHANNEL_WORD: Record<Channel, string> = {
  csv: "file",
  webhook: "message",
  api: "message",
  report: "report",
  email: "email",
};

const REPORT_NOUN: Partial<Record<MilestoneCode, string>> = {
  PICKED_UP: "the pickup",
  HUB_IN: "the arrival scan",
  HUB_OUT: "the departure scan",
  OUT_FOR_DELIVERY: "the delivery round",
  GATE_IN: "the gate-in",
  LOADED: "the loading",
  VESSEL_DEPARTED: "the vessel's departure",
  VESSEL_ARRIVED: "the vessel's arrival",
  DISCHARGED: "the discharge",
  GATE_OUT: "the gate-out",
  DELIVERED: "the delivery",
};

/** A milestone as the report an operator owes us: "the departure scan". */
export function reportNoun(code: MilestoneCode): string {
  return REPORT_NOUN[code] ?? MILESTONE_LABEL[code].toLowerCase();
}
