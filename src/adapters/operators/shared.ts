import type { z } from "zod";
import type { ParsedItem, ParseResult } from "@/domain/ingestion";
import type { LocalDate } from "@/domain/time";

export function parsed(items: ParsedItem[]): ParseResult {
  return { ok: true, items };
}

export function quarantined(reason: string): ParseResult {
  return { ok: false, reason };
}

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid payload";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

/** The lines of a file that hold something, as they came. */
function lines(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => line.trim() !== "");
}

/**
 * The data rows of a semicolon-separated message, without blank lines or the header row. The last
 * column is free text and may hold the separator itself: whatever follows the columns before it
 * is that one field.
 */
export function dataRows(body: string, header: string): string[][] {
  const before = header.split(";").length - 1;
  return lines(body)
    .map((line) => line.trim())
    .filter((line) => line !== header)
    .map((line) => {
      const fields = line.split(";");
      const row =
        fields.length > before
          ? [...fields.slice(0, before), fields.slice(before).join(";")]
          : fields;
      return row.map((field) => field.trim());
    });
}

/**
 * A file cut into its data rows, each as text that reads on its own: under the header when the
 * file came with one.
 */
export function splitRows(body: string, header: string): string[] {
  const isHeader = (line: string) => line.trim() === header;
  const all = lines(body);
  const headed = all.some(isHeader);
  return all.filter((line) => !isHeader(line)).map((row) => (headed ? `${header}\n${row}` : row));
}

/** "21/09/2026" as a local date, or `null` when it is not a calendar day. */
export function parseSpanishDate(text: string): LocalDate | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  const check = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date ? null : date;
}

export function formatSpanishDate(date: LocalDate): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

const PARTICLES = new Set(["de", "del", "la", "las", "los", "y"]);

/** "RIBA-ROJA DE TÚRIA" as a place name: "Riba-roja de Túria". */
export function toPlaceName(shouted: string): string {
  return shouted
    .trim()
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && PARTICLES.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase("es") + word.slice(1),
    )
    .join(" ");
}
