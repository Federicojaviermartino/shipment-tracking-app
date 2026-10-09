/** Code-unit order: unlike `localeCompare`, the same on every machine. */
export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Accents folded away: "MÁLAGA" in a carrier file and "malaga" in a question meet "Málaga". */
export function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
