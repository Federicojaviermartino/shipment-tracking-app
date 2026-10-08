import { CONSIGNEES } from "../directory";
import { oceanShipment } from "../lanes/ocean";
import type { SeededShipment } from "../lanes/shared";
import { ALTAIR_612W, CASTOR_611W, DENEB_614W, VEGA_610W } from "../sailings";

/**
 * The one free-text message in the dataset: Turia relays its Veracruz agent by email. No mapping
 * table can read it; a model does, and a person confirms the reading.
 */
export const CUSTOMS_HOLD_EMAIL = [
  "De: operaciones@turiaglobal.example",
  "Asunto: Exp. TGF-26-03290 / OC 48176 - Reconocimiento aduanero",
  "Nos informa nuestro agente en Veracruz: el pedimento salió en semáforo rojo. En el reconocimiento, la",
  "aduana detecta discrepancia de peso bruto entre la factura comercial (4.180 kg) y el BL (4.810 kg).",
  "La mercancía queda retenida hasta presentar factura rectificada. El plazo libre en terminal vence el",
  "viernes 9.",
].join("\n");

/** Ocean, Valencia to Veracruz, account Aquabajío, DAP. Times are local to each place. */
export const OCEAN_SHIPMENTS: SeededShipment[] = [
  // The customs-hold case: held at Veracruz on the reading of an email nobody has confirmed yet.
  oceanShipment({
    id: "EST-4012",
    orderRef: "48176",
    siteId: "BIO",
    consignee: CONSIGNEES.queretaroPlant,
    committed: "2026-10-09",
    cargo: {
      description: "VB valves",
      packages: "14 crates",
      grossWeightKg: 4810,
      container: { size: "20'", number: "NRYU3055186" },
    },
    sailing: CASTOR_611W,
    refs: {
      cierzo: "CRZ-2287764",
      booking: "NRY4468217",
      billOfLading: "NRYVLC4468217",
      turia: "TGF-26-03290",
    },
    actual: {
      booked: "2026-09-09 09:40",
      pickedUp: "2026-09-14 09:30",
      gateIn: { cierzo: "2026-09-15 07:50", noray: "2026-09-15 07:58" },
      exportReleased: { on: "2026-09-16", mrn: "26ES00461130044519" },
      loaded: "2026-09-18 02:20",
      billOfLading: "2026-09-21",
      discharged: "2026-10-03 09:15",
      importLodged: "2026-10-05",
      doorEstimates: [{ date: "2026-10-07", received: "2026-10-05 08:30" }],
      also: (turia) => [
        turia.email("2026-10-06 17:55", CUSTOMS_HOLD_EMAIL),
        turia.doorEstimateWithdrawn("2026-10-07 08:30", "Pendiente de aduana"),
      ],
    },
  }),
  oceanShipment({
    id: "EST-4019",
    orderRef: "48190",
    siteId: "ZAZ",
    consignee: CONSIGNEES.ptarSanJuan,
    committed: "2026-10-02",
    cargo: {
      description: "BS-4 booster skids",
      packages: "2 skids",
      grossWeightKg: 9600,
      container: { size: "40'HC", number: "NRYU2984176" },
    },
    sailing: VEGA_610W,
    refs: {
      cierzo: "CRZ-2286120",
      booking: "NRY4465532",
      billOfLading: "NRYVLC4465532",
      turia: "TGF-26-03188",
    },
    actual: {
      booked: "2026-09-02 11:20",
      pickedUp: "2026-09-07 15:20",
      gateIn: { cierzo: "2026-09-08 08:10", noray: "2026-09-08 08:17" },
      exportReleased: { on: "2026-09-09", mrn: "26ES00461130041277" },
      loaded: "2026-09-11 02:40",
      billOfLading: "2026-09-14",
      discharged: "2026-09-26 09:40",
      importLodged: "2026-09-28",
      importReleased: "2026-09-29",
      gateOut: "2026-09-30 10:30",
      delivered: "2026-10-01",
      doorEstimates: [
        { date: "2026-09-30", received: "2026-09-28 08:30" },
        { date: "2026-10-01", received: "2026-09-30 08:30" },
      ],
    },
    proofOfDelivery: "2026-10-02 09:10",
  }),
  oceanShipment({
    id: "EST-4033",
    orderRef: "48197",
    siteId: "VLC",
    consignee: CONSIGNEES.queretaroPlant,
    committed: "2026-10-12",
    cargo: {
      description: "LN 80 pumps",
      packages: "10 pallets",
      grossWeightKg: 6300,
      container: { size: "20'", number: "NRYU3062204" },
    },
    sailing: CASTOR_611W,
    refs: {
      cierzo: "CRZ-2287801",
      booking: "NRY4468240",
      billOfLading: "NRYVLC4468240",
      turia: "TGF-26-03301",
    },
    actual: {
      booked: "2026-09-09 12:05",
      pickedUp: "2026-09-15 08:40",
      gateIn: { cierzo: "2026-09-15 10:55", noray: "2026-09-15 11:03" },
      exportReleased: { on: "2026-09-16", mrn: "26ES00461130044533" },
      loaded: "2026-09-18 01:50",
      billOfLading: "2026-09-21",
      discharged: "2026-10-03 11:30",
      importLodged: "2026-10-06",
      doorEstimates: [
        { date: "2026-10-08", received: "2026-10-05 08:30" },
        { date: "2026-10-09", received: "2026-10-07 08:30" },
      ],
    },
  }),
  // Its gate-out reached us in real time, hours before the report that says customs released it.
  oceanShipment({
    id: "EST-4036",
    orderRef: "48198",
    siteId: "VLC",
    consignee: CONSIGNEES.queretaroPlant,
    committed: "2026-10-08",
    cargo: {
      description: "SR pumps",
      packages: "10 crates",
      grossWeightKg: 5150,
      container: { size: "20'", number: "NRYU3068711" },
    },
    sailing: CASTOR_611W,
    refs: {
      cierzo: "CRZ-2287803",
      booking: "NRY4468241",
      billOfLading: "NRYVLC4468241",
      turia: "TGF-26-03302",
    },
    actual: {
      booked: "2026-09-09 12:20",
      pickedUp: "2026-09-15 09:15",
      gateIn: { cierzo: "2026-09-15 11:20", noray: "2026-09-15 11:26" },
      exportReleased: { on: "2026-09-16", mrn: "26ES00461130044540" },
      loaded: "2026-09-18 02:05",
      billOfLading: "2026-09-21",
      discharged: "2026-10-03 08:50",
      importLodged: "2026-10-05",
      importReleased: "2026-10-06",
      gateOut: "2026-10-06 12:00",
      doorEstimates: [{ date: "2026-10-07", received: "2026-10-05 08:30" }],
    },
  }),
  // The port-incident case, order 12345: on time at T0, until its vessel is delayed.
  oceanShipment({
    id: "EST-4058",
    orderRef: "12345",
    siteId: "ZAZ",
    consignee: CONSIGNEES.queretaroPlant,
    committed: "2026-10-15",
    cargo: {
      description: "MV 150 pump sets",
      packages: "3 pump sets",
      grossWeightKg: 11200,
      container: { size: "40'HC", number: "NRYU4821373" },
    },
    sailing: ALTAIR_612W,
    refs: {
      cierzo: "CRZ-2290311",
      booking: "NRY4471903",
      billOfLading: "NRYVLC4471903",
      turia: "TGF-26-03412",
    },
    actual: {
      booked: "2026-09-16 10:12",
      pickedUp: "2026-09-21 15:10",
      gateIn: { cierzo: "2026-09-22 08:25", noray: "2026-09-22 08:31" },
      exportReleased: { on: "2026-09-23", mrn: "26ES00461130047821" },
      loaded: "2026-09-25 03:10",
      billOfLading: "2026-09-28",
      doorEstimates: [{ date: "2026-10-14", received: "2026-10-06 08:30" }],
    },
  }),
  // Same vessel as order 12345, with five days of slack: a vessel delay only moves its date.
  oceanShipment({
    id: "EST-4063",
    orderRef: "48221",
    siteId: "VLC",
    consignee: CONSIGNEES.ptarSanJuan,
    committed: "2026-10-20",
    cargo: {
      description: "VB valves",
      packages: "9 crates",
      grossWeightKg: 3900,
      container: { size: "20'", number: "NRYU4830098" },
    },
    sailing: ALTAIR_612W,
    refs: {
      cierzo: "CRZ-2290358",
      booking: "NRY4471958",
      billOfLading: "NRYVLC4471958",
      turia: "TGF-26-03418",
    },
    actual: {
      booked: "2026-09-16 13:30",
      pickedUp: "2026-09-22 08:50",
      gateIn: { cierzo: "2026-09-22 11:10", noray: "2026-09-22 11:18" },
      exportReleased: { on: "2026-09-23", mrn: "26ES00461130047836" },
      loaded: "2026-09-25 03:25",
      billOfLading: "2026-09-28",
      doorEstimates: [{ date: "2026-10-14", received: "2026-10-06 08:30" }],
    },
  }),
  // In the terminal with no commercial invoice on file, twenty hours before the export cut-off.
  oceanShipment({
    id: "EST-4116",
    orderRef: "48236",
    siteId: "VLC",
    consignee: CONSIGNEES.queretaroPlant,
    committed: "2026-10-30",
    cargo: {
      description: "seal kits",
      packages: "11 pallets",
      grossWeightKg: 4200,
      container: { size: "20'", number: "NRYU5165541" },
    },
    sailing: DENEB_614W,
    refs: { cierzo: "CRZ-2291021", booking: "NRY4477310", turia: "TGF-26-03455" },
    actual: {
      booked: "2026-09-30 10:40",
      pickedUp: "2026-10-06 08:45",
      gateIn: { cierzo: "2026-10-06 11:05", noray: "2026-10-06 11:12" },
      doorEstimates: [{ date: "2026-10-28", received: "2026-10-01 08:30" }],
    },
    notOnFile: ["commercial_invoice"],
  }),
  // Booked late: collected two days after the lane norm, still in time for the same sailing.
  oceanShipment({
    id: "EST-4122",
    orderRef: "48244",
    siteId: "ZAZ",
    consignee: CONSIGNEES.queretaroPlant,
    committed: "2026-10-30",
    cargo: {
      description: "BS-6 booster skids",
      packages: "2 skids",
      grossWeightKg: 10300,
      container: { size: "40'HC", number: "NRYU5172643" },
    },
    sailing: DENEB_614W,
    refs: { cierzo: "CRZ-2291502", booking: "NRY4478066", turia: "TGF-26-03471" },
    replanned: {
      booked: "2026-10-05 15:00",
      pickedUp: "2026-10-07 10:30",
      gateIn: "2026-10-08 08:00",
      exportReleased: "2026-10-08",
    },
    actual: { booked: "2026-10-05 15:10", pickedUp: "2026-10-07 11:00" },
  }),
];
