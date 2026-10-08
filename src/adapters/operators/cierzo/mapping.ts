import type { MilestoneCode } from "@/domain/shipment";
import type { Zone } from "@/domain/time";

export const CIERZO = "CRZ";

/** Wall-clock times in the file carry no zone: Cierzo works in Spain and means Madrid time. */
export const CIERZO_ZONE: Zone = "Europe/Madrid";

export const CIERZO_HEADER = "expedicion;codigo;estado;plaza;fecha;observaciones";

/** Status code to milestone. The text is what the emitter writes; the code is what is trusted. */
export const CIERZO_MILESTONES: Record<string, { text: string; milestone: MilestoneCode }> = {
  "10": { text: "RECOGIDA EFECTUADA", milestone: "PICKED_UP" },
  "25": { text: "LLEGADA A PLATAFORMA", milestone: "HUB_IN" },
  "26": { text: "SALIDA DE PLATAFORMA", milestone: "HUB_OUT" },
  "30": { text: "EN REPARTO", milestone: "OUT_FOR_DELIVERY" },
  "40": { text: "ENTREGADO", milestone: "DELIVERED" },
  "60": { text: "ENTRADA EN TERMINAL", milestone: "GATE_IN" },
};

export const CIERZO_INCIDENT = { code: "50", text: "INCIDENCIA" };
export const CIERZO_INCIDENT_RESOLVED = { code: "55", text: "INCIDENCIA RESUELTA" };

/**
 * An incident whose remark says the goods are held is a carrier hold. The reason shown to
 * operations is a fixed English rendering per pattern, first match wins; the Spanish remark stays
 * available under the original message.
 */
export const CIERZO_HOLD_PATTERNS: {
  name: string;
  pattern: RegExp;
  reason: (match: RegExpExecArray) => string;
}[] = [
  {
    name: "damaged at platform, held",
    pattern: /(\d+) BULTOS? DAÑADOS? EN PLATAFORMA.*RETENID/,
    reason: (match) =>
      `${match[1]} package${match[1] === "1" ? "" : "s"} damaged at the platform; goods held awaiting instructions`,
  },
  { name: "held", pattern: /RETENID/, reason: () => "Goods held by the carrier" },
];

/** "NUEVA ENTREGA PREVISTA 08/10": the carrier's new delivery day, without a year. */
export const CIERZO_NEW_DELIVERY = /NUEVA ENTREGA PREVISTA (\d{2})\/(\d{2})/;
