import type { DocumentType, MilestoneCode } from "@/domain/shipment";

export const TURIA = "TGF";

export const TURIA_HEADER = "expediente;ref_cliente;concepto;estado;fecha;observaciones";

/** Every file reference Turia issues looks like this; an email is correlated by the one it quotes. */
export const TURIA_FILE_REFERENCE = /TGF-\d{2}-\d{5}/;

export type TuriaMeaning =
  | { kind: "milestone"; milestone: MilestoneCode; clearsCustomsHold?: true }
  | { kind: "estimate"; milestone: MilestoneCode }
  | { kind: "estimate_withdrawn"; milestone: MilestoneCode }
  | { kind: "document"; docType: DocumentType };

/**
 * The daily status report, one meaning per `concepto` / `estado` pair. The report gives days, not
 * times, and names no place: the milestone itself says where it happens.
 */
export const TURIA_REPORT: { concepto: string; estado: string; meaning: TuriaMeaning }[] = [
  {
    concepto: "DESPACHO EXPORTACION",
    estado: "LEVANTE",
    meaning: { kind: "milestone", milestone: "EXPORT_RELEASED" },
  },
  {
    concepto: "DESPACHO IMPORTACION",
    estado: "PEDIMENTO PRESENTADO",
    meaning: { kind: "milestone", milestone: "IMPORT_LODGED" },
  },
  {
    concepto: "DESPACHO IMPORTACION",
    estado: "DESADUANADO",
    meaning: { kind: "milestone", milestone: "IMPORT_RELEASED", clearsCustomsHold: true },
  },
  { concepto: "ENTREGA", estado: "ETA", meaning: { kind: "estimate", milestone: "DELIVERED" } },
  {
    concepto: "ENTREGA",
    estado: "ETA PENDIENTE",
    meaning: { kind: "estimate_withdrawn", milestone: "DELIVERED" },
  },
  {
    concepto: "ENTREGA",
    estado: "ENTREGADO",
    meaning: { kind: "milestone", milestone: "DELIVERED" },
  },
  {
    concepto: "DOCUMENTO",
    estado: "BL EMITIDO",
    meaning: { kind: "document", docType: "bill_of_lading" },
  },
];
