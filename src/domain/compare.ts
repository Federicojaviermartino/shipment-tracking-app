/** Code-unit order: unlike `localeCompare`, the same on every machine. */
export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
