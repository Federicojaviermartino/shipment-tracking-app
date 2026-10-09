import type { TextInterpreter, TextReading } from "@/application/ports/text-interpreter";

/**
 * Stands in for a small language model constrained to the closed vocabulary of observations. It
 * reads Spanish free text with keyword and pattern rules, composes its reading from what the text
 * says (who holds the goods, which documents disagree, by how much, what is asked for) and
 * answers `null` for anything it cannot read. A pure function of the text.
 */

const HELD = /\bretenid[ao]s?\b/i;
const CUSTOMS = /aduan|pedimento|reconocimiento|sem[aá]foro rojo/i;
const CORRECTED_INVOICE = /factura rectificada/i;
const WEIGHT_DISCREPANCY =
  /discrepancia de peso( bruto)?(?: entre (?:la |el )?(.+?) \(([\d.,]+)\s*kg\) y (?:la |el )?(.+?) \(([\d.,]+)\s*kg\))?/i;

const DOCUMENT_NAMES: { pattern: RegExp; name: string }[] = [
  { pattern: /factura comercial/i, name: "the commercial invoice" },
  { pattern: /^(bl|b\/l)$|conocimiento de embarque/i, name: "the bill of lading" },
  { pattern: /lista de (empaque|contenido)|packing list/i, name: "the packing list" },
  { pattern: /pedimento/i, name: "the import entry" },
];

function documentName(spanish: string): string {
  const text = spanish.trim();
  return DOCUMENT_NAMES.find(({ pattern }) => pattern.test(text))?.name ?? `"${text}"`;
}

/** "4.180" in Spanish notation is "4,180" in English. */
function kilograms(spanish: string): string {
  const value = Number(spanish.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return `${spanish} kg`;
  const [whole = "0", fraction] = String(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${fraction ? `${grouped}.${fraction}` : grouped} kg`;
}

function customsFinding(text: string): string {
  const discrepancy = WEIGHT_DISCREPANCY.exec(text);
  if (!discrepancy) return "Customs is holding the goods after an inspection";
  const kind = discrepancy[1] ? "gross-weight" : "weight";
  const [, , first, firstWeight, second, secondWeight] = discrepancy;
  if (!first || !firstWeight || !second || !secondWeight) {
    return `Customs found a ${kind} discrepancy in the documents`;
  }
  return `Customs found a ${kind} discrepancy between ${documentName(first)} (${kilograms(firstWeight)}) and ${documentName(second)} (${kilograms(secondWeight)})`;
}

function read(text: string): TextReading | null {
  const flat = text.replace(/\s+/g, " ");
  if (!HELD.test(flat)) return null;

  if (!CUSTOMS.test(flat)) {
    return {
      observation: {
        type: "hold",
        hold: "carrier",
        state: "raised",
        reason: "Goods held by the carrier",
      },
      rule: "pattern:carrier hold",
    };
  }

  // What customs asks for is read as data as well as words: the playbook proposes sending a
  // document only when the message names one.
  const invoiceAsked = CORRECTED_INVOICE.test(flat);
  return {
    observation: {
      type: "hold",
      hold: "customs",
      state: "raised",
      reason: `${customsFinding(flat)}${invoiceAsked ? "; a corrected invoice is required" : ""}.`,
      ...(invoiceAsked ? { requires: "commercial_invoice" as const } : {}),
    },
    rule: "pattern:customs hold",
  };
}

export const patternTextInterpreter: TextInterpreter = {
  read: ({ text }) => Promise.resolve(read(text)),
};
