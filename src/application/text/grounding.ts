import { formatDay, type LocalDate } from "@/domain/time";

/**
 * The check between a draft and the outside world: a message should only mention calendar dates
 * that are in the shipment record it was written from. It reads the text, deterministically and
 * the same way for a model's draft and for a person's edit.
 *
 * It is a lint, not a proof. It knows a day next to a month name, with the weekday when one is
 * written, and numeric dates that carry a year; "the 12th", "next Monday" or a wrong year pass
 * unseen. What a customer reads as the delivery date never depends on it: that date is taken
 * from the record when the notice is sent.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * A month by its name or its abbreviation, and nothing that merely starts like one. "May" counts
 * only with its capital: "one of the 4 may be damaged" is not the fourth of May.
 */
const MONTH =
  "([Jj]an(?:uary)?|[Ff]eb(?:ruary)?|[Mm]ar(?:ch)?|[Aa]pr(?:il)?|May|[Jj]une?|[Jj]uly?|" +
  "[Aa]ug(?:ust)?|[Ss]ep(?:t(?:ember)?)?|[Oo]ct(?:ober)?|[Nn]ov(?:ember)?|[Dd]ec(?:ember)?)" +
  "(?![A-Za-z])\\.?";
/** The weekday a date may be written after, with its capital: "sat" and "wed" are also verbs. */
const WEEKDAY =
  "(?:\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:s|nes|rs?|ur)?(?:day)?(?![A-Za-z])\\.?,?\\s+)?";

const DAY_THEN_MONTH = new RegExp(`${WEEKDAY}\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}`, "g");
/** "Oct 16", but not the "Oct 08" of "16 Oct 08:25", where the number is an hour. */
const MONTH_THEN_DAY = new RegExp(
  `${WEEKDAY}\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:\\d])`,
  "g",
);
/** Only with its year: "3/4 pallets" and "24/7" are not dates. */
const NUMERIC = /\b(\d{1,2})\/(\d{1,2})\/(?:\d{4}|\d{2})\b/g;
const ISO = /\b\d{4}-(\d{2})-(\d{2})\b/g;

function dayAndMonth(day: number, month: number, weekday?: string): string | null {
  const name = MONTHS[month - 1];
  if (!name || day < 1 || day > 31) return null;
  return weekday ? `${weekday} ${day} ${name}` : `${day} ${name}`;
}

function monthNumber(name: string): number {
  return MONTHS.findIndex((month) => month.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1;
}

/**
 * Every calendar date written in a text, as the product writes one: "16 Oct", or "Fri 16 Oct"
 * when the text names the weekday.
 */
export function datesIn(text: string): string[] {
  const found: (string | null)[] = [];
  let rest = text.replace(ISO, (_, month: string, day: string) => {
    found.push(dayAndMonth(Number(day), Number(month)));
    return " ";
  });
  rest = rest.replace(
    DAY_THEN_MONTH,
    (_, weekday: string | undefined, day: string, month: string) => {
      found.push(dayAndMonth(Number(day), monthNumber(month), weekday));
      return " ";
    },
  );
  rest = rest.replace(
    MONTH_THEN_DAY,
    (_, weekday: string | undefined, month: string, day: string) => {
      found.push(dayAndMonth(Number(day), monthNumber(month), weekday));
      return " ";
    },
  );
  rest.replace(NUMERIC, (_, day: string, month: string) => {
    found.push(dayAndMonth(Number(day), Number(month)));
    return " ";
  });
  return [...new Set(found.filter((date): date is string => date !== null))];
}

/** "Fri 16 Oct" without its weekday. */
function dayOnly(date: string): string {
  return date.split(" ").slice(-2).join(" ");
}

/**
 * The dates of a text that no fact of the sheet carries, each as written in the product: a day
 * the record does not hold is named as a day ("18 Oct"); one it does hold, written with a weekday
 * it does not fall on, is named with that weekday ("Wed 8 Oct").
 */
export function ungroundedDates(
  text: string,
  facts: readonly { dates: readonly LocalDate[] }[],
): string[] {
  const days = facts.flatMap((fact) => fact.dates.map(formatDay));
  const known = new Set([...days, ...days.map(dayOnly)]);
  const strangers = datesIn(text).flatMap((written) => {
    if (known.has(written)) return [];
    return [known.has(dayOnly(written)) ? written : dayOnly(written)];
  });
  return [...new Set(strangers)];
}
