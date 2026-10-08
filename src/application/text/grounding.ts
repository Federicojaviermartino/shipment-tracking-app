import { formatDay, type LocalDate } from "@/domain/time";

/**
 * The guard between a draft and the outside world: a message may only mention calendar dates
 * that are in the shipment record it was written from. It is a check on the text, deterministic
 * and the same for a model's draft and for a person's edit.
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

const DAY_THEN_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}`, "g");
/** "Oct 16", but not the "Oct 08" of "16 Oct 08:25", where the number is an hour. */
const MONTH_THEN_DAY = new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:\\d])`, "g");
const NUMERIC = /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g;
const ISO = /\b\d{4}-(\d{2})-(\d{2})\b/g;

function dayAndMonth(day: number, month: number): string | null {
  const name = MONTHS[month - 1];
  return name && day >= 1 && day <= 31 ? `${day} ${name}` : null;
}

function monthNumber(name: string): number {
  return MONTHS.findIndex((month) => month.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1;
}

/** Every calendar date written in a text, as day and month: "16 Oct". */
export function datesIn(text: string): string[] {
  const found: (string | null)[] = [];
  let rest = text.replace(ISO, (_, month: string, day: string) => {
    found.push(dayAndMonth(Number(day), Number(month)));
    return " ";
  });
  rest = rest.replace(DAY_THEN_MONTH, (_, day: string, month: string) => {
    found.push(dayAndMonth(Number(day), monthNumber(month)));
    return " ";
  });
  rest = rest.replace(MONTH_THEN_DAY, (_, month: string, day: string) => {
    found.push(dayAndMonth(Number(day), monthNumber(month)));
    return " ";
  });
  rest.replace(NUMERIC, (_, day: string, month: string) => {
    found.push(dayAndMonth(Number(day), Number(month)));
    return " ";
  });
  return [...new Set(found.filter((date): date is string => date !== null))];
}

/** The dates of a text that no fact of the sheet carries, each as written in the product. */
export function ungroundedDates(
  text: string,
  facts: readonly { dates: readonly LocalDate[] }[],
): string[] {
  const known = new Set(
    facts.flatMap((fact) =>
      fact.dates.map((date) => formatDay(date).split(" ").slice(1).join(" ")),
    ),
  );
  return datesIn(text).filter((date) => !known.has(date));
}
