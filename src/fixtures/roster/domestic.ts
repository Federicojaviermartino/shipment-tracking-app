import { milestoneKey } from "@/domain/shipment";
import { at, MADRID } from "../calendar";
import { CONSIGNEES } from "../directory";
import { domesticShipment } from "../lanes/domestic";
import type { SeededShipment } from "../lanes/shared";
import { ALMERIA, MALAGA, MURCIA, SEVILLA, TERUEL, ZARAGOZA } from "../places";

/** Domestic road with Transportes Cierzo, DAP. Every time is Madrid wall-clock. */
export const DOMESTIC_SHIPMENTS: SeededShipment[] = [
  domesticShipment({
    id: "EST-4120",
    orderRef: "15338",
    siteId: "BIO",
    consignee: CONSIGNEES.sevillaDepot,
    committed: "2026-10-06",
    cargo: { description: "VB valves", packages: "6 pallets", grossWeightKg: 2300 },
    expedicion: "CRZ-2291102",
    platform: SEVILLA,
    plan: {
      booked: "2026-10-01 09:00",
      pickedUp: "2026-10-02 10:00",
      hubIn: "2026-10-06 05:00",
      outForDelivery: "2026-10-06 08:00",
      delivered: "2026-10-06 11:00",
    },
    actual: {
      booked: "2026-10-01 09:15",
      pickedUp: "2026-10-02 10:10",
      hubIn: "2026-10-06 05:20",
      outForDelivery: "2026-10-06 08:05",
      delivered: "2026-10-06 10:22",
    },
    proofOfDelivery: "2026-10-06 16:30",
  }),
  // A breakdown near Teruel sent it back to the Zaragoza platform: an incident note, a hub scan
  // that was never planned and a new delivery date two days after the committed one.
  domesticShipment({
    id: "EST-4128",
    orderRef: "20561",
    siteId: "ZAZ",
    consignee: CONSIGNEES.murciaWarehouse,
    committed: "2026-10-06",
    cargo: { description: "LN 100 pumps", packages: "5 pallets", grossWeightKg: 1850 },
    expedicion: "CRZ-2291188",
    platform: MURCIA,
    plan: {
      booked: "2026-10-01 12:00",
      pickedUp: "2026-10-05 16:00",
      hubIn: "2026-10-06 05:00",
      outForDelivery: "2026-10-06 08:00",
      delivered: "2026-10-06 11:00",
    },
    actual: {
      booked: "2026-10-01 12:30",
      pickedUp: "2026-10-05 16:00",
      also: (cierzo) => [
        cierzo.incident(
          TERUEL,
          "2026-10-06 02:50",
          "AVERÍA VEHÍCULO TRACTOR A-23. MERCANCÍA SIN DAÑOS",
        ),
        cierzo.milestone("HUB_IN", ZARAGOZA, "2026-10-06 11:30"),
        cierzo.newDeliveryDate(ZARAGOZA, "2026-10-06 12:10", "2026-10-08"),
      ],
    },
  }),
  // Held at the Málaga platform for damage, on its committed day.
  domesticShipment({
    id: "EST-4131",
    orderRef: "15346",
    siteId: "VLC",
    consignee: CONSIGNEES.edarMalaga,
    committed: "2026-10-07",
    cargo: { description: "SR pumps", packages: "4 pallets", grossWeightKg: 1420 },
    expedicion: "CRZ-2291274",
    platform: MALAGA,
    plan: {
      booked: "2026-10-02 10:00",
      pickedUp: "2026-10-05 17:00",
      hubIn: "2026-10-07 05:00",
      outForDelivery: "2026-10-07 07:00",
      delivered: "2026-10-07 11:00",
    },
    actual: {
      booked: "2026-10-02 10:05",
      pickedUp: "2026-10-05 17:20",
      hubIn: "2026-10-07 04:40",
      also: (cierzo) => [
        cierzo.hold(
          MALAGA,
          "2026-10-07 05:10",
          "1 BULTO DAÑADO EN PLATAFORMA. MERCANCÍA RETENIDA A LA ESPERA DE INSTRUCCIONES",
          "1 package damaged at the platform; goods held awaiting instructions",
        ),
      ],
    },
    deadlines: [
      {
        kind: "next_departure",
        at: at("2026-10-08 07:00", MADRID),
        label: "Tomorrow's first delivery round leaves the Málaga platform",
        milestoneKey: milestoneKey("OUT_FOR_DELIVERY", MALAGA),
      },
    ],
  }),
  domesticShipment({
    id: "EST-4133",
    orderRef: "15347",
    siteId: "ZAZ",
    consignee: CONSIGNEES.sevillaDepot,
    committed: "2026-10-07",
    cargo: { description: "spare kits", packages: "3 pallets", grossWeightKg: 640 },
    expedicion: "CRZ-2291310",
    platform: SEVILLA,
    plan: {
      booked: "2026-10-02 11:30",
      pickedUp: "2026-10-05 16:00",
      hubIn: "2026-10-07 05:00",
      outForDelivery: "2026-10-07 08:00",
      delivered: "2026-10-07 12:00",
    },
    actual: {
      booked: "2026-10-02 11:40",
      pickedUp: "2026-10-05 16:25",
      hubIn: "2026-10-07 04:55",
      outForDelivery: "2026-10-07 08:10",
      delivered: "2026-10-07 12:05",
      deliveryRemark: "FIRMADO: ALMACÉN. SIN RESERVAS",
    },
  }),
  domesticShipment({
    id: "EST-4141",
    orderRef: "20570",
    siteId: "BIO",
    consignee: CONSIGNEES.murciaWarehouse,
    committed: "2026-10-08",
    cargo: { description: "VB valves", packages: "8 pallets", grossWeightKg: 3100 },
    expedicion: "CRZ-2291402",
    platform: MURCIA,
    plan: {
      booked: "2026-10-05 09:30",
      pickedUp: "2026-10-06 17:00",
      hubIn: "2026-10-08 05:00",
      outForDelivery: "2026-10-08 08:00",
      delivered: "2026-10-08 11:00",
    },
    actual: { booked: "2026-10-05 09:50", pickedUp: "2026-10-06 17:00" },
  }),
  // Collected on the eve of a long weekend: Friday is a holiday in Valencia and Monday in all of
  // Spain, so the goods wait at the Valencia platform, which is the closed one, are trunked on
  // Monday night and reach Almería on the committed Tuesday.
  domesticShipment({
    id: "EST-4147",
    orderRef: "20574",
    siteId: "VLC",
    consignee: CONSIGNEES.elEjidoSite,
    committed: "2026-10-13",
    cargo: { description: "LN 65 pumps", packages: "10 pallets", grossWeightKg: 2750 },
    expedicion: "CRZ-2291567",
    platform: ALMERIA,
    plan: {
      booked: "2026-10-06 10:00",
      pickedUp: "2026-10-08 16:00",
      hubIn: "2026-10-13 05:00",
      outForDelivery: "2026-10-13 08:00",
      delivered: "2026-10-13 12:00",
    },
    actual: { booked: "2026-10-06 10:20" },
  }),
];
