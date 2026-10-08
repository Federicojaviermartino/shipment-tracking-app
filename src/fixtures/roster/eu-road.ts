import { milestoneKey } from "@/domain/shipment";
import { at, PARIS } from "../calendar";
import { CONSIGNEES } from "../directory";
import type { Waypoint } from "../feed";
import { fullLoadShipment, groupageShipment } from "../lanes/eu-road";
import type { SeededShipment } from "../lanes/shared";
import { BILBAO, LYON, PERPIGNAN, TOULOUSE, VALENCIA, ZARAGOZA } from "../places";

const es = (name: string, lat: number, lon: number): Waypoint => ({
  name,
  country: "ES",
  lat,
  lon,
});
const fr = (name: string, lat: number, lon: number): Waypoint => ({
  name,
  country: "FR",
  lat,
  lon,
});
const de = (name: string, lat: number, lon: number): Waypoint => ({
  name,
  country: "DE",
  lat,
  lon,
});

// The motorway corridor from Spain into France and on to the Rhine, as the trucks drive it.
const ZARAGOZA_WP = es("Zaragoza", 41.65, -0.89);
const FRAGA = es("Fraga", 41.52, 0.35);
const LLEIDA = es("Lleida", 41.62, 0.62);
const CERVERA = es("Cervera", 41.67, 1.27);
const IGUALADA = es("Igualada", 41.58, 1.62);
const MARTORELL = es("Martorell", 41.47, 1.93);
const GRANOLLERS = es("Granollers", 41.61, 2.29);
const GIRONA = es("Girona", 41.98, 2.82);
const FIGUERES = es("Figueres", 42.27, 2.96);
const LA_JONQUERA = es("La Jonquera", 42.42, 2.87);
const RIBA_ROJA_WP = es("Riba-roja de Túria", 39.55, -0.57);
const CASTELLON = es("Castelló de la Plana", 39.99, -0.05);
const TARRAGONA = es("Tarragona", 41.12, 1.25);
const PERPIGNAN_WP = fr("Perpignan", 42.7, 2.89);
const NARBONNE = fr("Narbonne", 43.18, 3.0);
const BEZIERS = fr("Béziers", 43.34, 3.21);
const MONTPELLIER = fr("Montpellier", 43.61, 3.88);
const NIMES = fr("Nîmes", 43.84, 4.36);
const VALENCE = fr("Valence", 44.93, 4.89);
const VIENNE = fr("Vienne", 45.52, 4.87);
const LYON_WP = fr("Lyon", 45.76, 4.84);
const SAINT_PRIEST_WP = fr("Saint-Priest", 45.7, 4.94);
const MACON = fr("Mâcon", 46.31, 4.83);
const BEAUNE = fr("Beaune", 47.02, 4.84);
const BESANCON = fr("Besançon", 47.24, 6.02);
const MULHOUSE = fr("Mulhouse", 47.75, 7.34);
const KARLSRUHE = de("Karlsruhe", 49.01, 8.4);
const MANNHEIM_WP = de("Mannheim", 49.49, 8.47);

const INTO_FRANCE = [GIRONA, FIGUERES, LA_JONQUERA, PERPIGNAN_WP, NARBONNE];
const RHONE_VALLEY = [NARBONNE, BEZIERS, MONTPELLIER, NIMES, VALENCE, VIENNE, LYON_WP];
const TO_THE_RHINE = [BEAUNE, BESANCON, MULHOUSE, KARLSRUHE, MANNHEIM_WP];

/** EU road, full loads on Eisvogel's own fleet: a position every 30 minutes while driving. */
export const FULL_LOAD_SHIPMENTS: SeededShipment[] = [
  fullLoadShipment({
    id: "EST-4107",
    orderRef: "61877",
    siteId: "ZAZ",
    consignee: CONSIGNEES.mannheimWarehouse,
    committed: "2026-10-05",
    incoterm: "DAP",
    cargo: { description: "LN pumps", packages: "22 pallets", grossWeightKg: 13800 },
    sendungsnr: "EVS-88104211",
    plan: {
      booked: "2026-09-28 10:00",
      pickedUp: "2026-10-01 13:00",
      delivered: "2026-10-05 09:00",
    },
    actual: {
      booked: "2026-09-28 10:30",
      pickedUp: "2026-10-01 13:10",
      // Thursday to Girona, Friday up the Rhône to Beaune, the weekend parked, Monday to the Rhine.
      drives: [
        {
          from: "2026-10-01 13:10",
          to: "2026-10-01 19:10",
          route: [ZARAGOZA_WP, FRAGA, LLEIDA, CERVERA, IGUALADA, MARTORELL, GRANOLLERS, GIRONA],
        },
        {
          from: "2026-10-02 06:10",
          to: "2026-10-02 15:40",
          route: [...INTO_FRANCE, ...RHONE_VALLEY.slice(1), MACON, BEAUNE],
        },
        { from: "2026-10-05 02:40", to: "2026-10-05 08:40", route: TO_THE_RHINE },
      ],
      delivered: "2026-10-05 08:50",
    },
    proofOfDelivery: "2026-10-07 10:00",
  }),
  fullLoadShipment({
    id: "EST-4111",
    orderRef: "61880",
    siteId: "VLC",
    consignee: CONSIGNEES.mannheimWarehouse,
    committed: "2026-10-06",
    incoterm: "DAP",
    cargo: { description: "spares", packages: "18 pallets", grossWeightKg: 9200 },
    sendungsnr: "EVS-88104305",
    plan: {
      booked: "2026-09-29 15:00",
      pickedUp: "2026-10-02 09:00",
      delivered: "2026-10-06 15:00",
    },
    actual: {
      booked: "2026-09-29 15:20",
      pickedUp: "2026-10-02 09:05",
      drives: [
        {
          from: "2026-10-02 09:05",
          to: "2026-10-02 18:35",
          route: [RIBA_ROJA_WP, CASTELLON, TARRAGONA, MARTORELL, GRANOLLERS, ...INTO_FRANCE],
        },
        {
          from: "2026-10-05 05:05",
          to: "2026-10-05 14:35",
          route: [...RHONE_VALLEY, MACON, BEAUNE],
        },
        { from: "2026-10-06 08:05", to: "2026-10-06 14:35", route: TO_THE_RHINE },
      ],
      delivered: "2026-10-06 15:10",
    },
  }),
  fullLoadShipment({
    id: "EST-4115",
    orderRef: "71204",
    siteId: "ZAZ",
    consignee: CONSIGNEES.saintPriestHq,
    committed: "2026-10-06",
    incoterm: "CPT",
    cargo: { description: "MV pumps", packages: "20 pallets", grossWeightKg: 12100 },
    sendungsnr: "EVS-88104419",
    plan: {
      booked: "2026-09-30 09:00",
      pickedUp: "2026-10-05 08:00",
      delivered: "2026-10-06 10:00",
    },
    actual: {
      booked: "2026-09-30 09:10",
      pickedUp: "2026-10-05 08:10",
      drives: [
        {
          from: "2026-10-05 08:10",
          to: "2026-10-05 17:40",
          route: [ZARAGOZA_WP, LLEIDA, MARTORELL, ...INTO_FRANCE, BEZIERS, MONTPELLIER, NIMES],
        },
        {
          from: "2026-10-06 06:10",
          to: "2026-10-06 09:10",
          route: [NIMES, VALENCE, VIENNE, SAINT_PRIEST_WP],
        },
      ],
      delivered: "2026-10-06 09:40",
    },
    proofOfDelivery: "2026-10-07 11:30",
  }),
  // A truck that reports every 30 minutes and has said nothing since La Jonquera, 27 hours ago.
  fullLoadShipment({
    id: "EST-4127",
    orderRef: "61893",
    siteId: "ZAZ",
    consignee: CONSIGNEES.mannheimWarehouse,
    committed: "2026-10-08",
    incoterm: "DAP",
    cargo: { description: "MV pumps", packages: "24 pallets", grossWeightKg: 14600 },
    sendungsnr: "EVS-88104588",
    plan: {
      booked: "2026-10-01 16:00",
      pickedUp: "2026-10-05 14:00",
      delivered: "2026-10-08 11:00",
    },
    actual: {
      booked: "2026-10-01 16:10",
      pickedUp: "2026-10-05 14:00",
      drives: [
        {
          from: "2026-10-05 14:00",
          to: "2026-10-05 18:30",
          route: [ZARAGOZA_WP, FRAGA, LLEIDA, CERVERA, IGUALADA],
        },
        {
          from: "2026-10-06 09:00",
          to: "2026-10-06 13:00",
          route: [IGUALADA, MARTORELL, GRANOLLERS, GIRONA, FIGUERES, LA_JONQUERA],
        },
      ],
    },
  }),
  fullLoadShipment({
    id: "EST-4140",
    orderRef: "71222",
    siteId: "ZAZ",
    consignee: CONSIGNEES.saintPriestHq,
    committed: "2026-10-08",
    incoterm: "CPT",
    cargo: { description: "LN pumps", packages: "21 pallets", grossWeightKg: 12900 },
    sendungsnr: "EVS-88104700",
    plan: {
      booked: "2026-10-02 12:00",
      pickedUp: "2026-10-06 15:00",
      delivered: "2026-10-08 08:30",
    },
    actual: {
      booked: "2026-10-02 12:15",
      pickedUp: "2026-10-06 15:05",
      drives: [
        {
          from: "2026-10-06 15:05",
          to: "2026-10-06 19:35",
          route: [ZARAGOZA_WP, FRAGA, LLEIDA, CERVERA, MARTORELL],
        },
        {
          from: "2026-10-07 08:05",
          to: "2026-10-07 15:35",
          route: [MARTORELL, GRANOLLERS, ...INTO_FRANCE, BEZIERS, MONTPELLIER, NIMES],
        },
      ],
    },
  }),
];

/** EU road, groupage through Eisvogel's network: hub scans only, no telematics. */
export const GROUPAGE_SHIPMENTS: SeededShipment[] = [
  // Predicted late: into the Perpignan hub on Tuesday morning, and the departure scan planned for
  // Tuesday 20:00 never came. The absence is the signal.
  groupageShipment({
    id: "EST-4134",
    orderRef: "71219",
    siteId: "VLC",
    consignee: CONSIGNEES.saintPriestHq,
    committed: "2026-10-08",
    incoterm: "CPT",
    cargo: { description: "VB valves", packages: "7 pallets", grossWeightKg: 2650 },
    sendungsnr: "EVS-88104652",
    depot: VALENCIA,
    hub: PERPIGNAN,
    plan: {
      booked: "2026-10-01 11:00",
      pickedUp: "2026-10-05 15:00",
      depotIn: "2026-10-05 18:30",
      depotOut: "2026-10-05 22:00",
      hubIn: "2026-10-06 06:00",
      hubOut: "2026-10-06 20:00",
      outForDelivery: "2026-10-08 07:00",
      delivered: "2026-10-08 10:00",
    },
    actual: {
      booked: "2026-10-01 11:05",
      pickedUp: "2026-10-05 15:05",
      depotIn: "2026-10-05 18:30",
      depotOut: "2026-10-05 22:10",
      hubIn: "2026-10-06 06:10",
    },
    deadlines: [
      {
        kind: "next_departure",
        at: at("2026-10-07 20:00", PARIS),
        label: "Next linehaul leaves the Perpignan hub",
        milestoneKey: milestoneKey("HUB_OUT", PERPIGNAN),
      },
    ],
  }),
  groupageShipment({
    id: "EST-4136",
    orderRef: "61899",
    siteId: "BIO",
    consignee: CONSIGNEES.mannheimWarehouse,
    committed: "2026-10-12",
    incoterm: "DAP",
    cargo: { description: "VG valves", packages: "9 pallets", grossWeightKg: 3300 },
    sendungsnr: "EVS-88104671",
    depot: BILBAO,
    hub: LYON,
    plan: {
      booked: "2026-10-02 10:00",
      pickedUp: "2026-10-05 15:00",
      depotIn: "2026-10-05 18:00",
      depotOut: "2026-10-05 22:00",
      hubIn: "2026-10-07 03:00",
      hubOut: "2026-10-07 21:00",
      outForDelivery: "2026-10-09 07:30",
      delivered: "2026-10-09 11:00",
    },
    actual: {
      booked: "2026-10-02 10:10",
      pickedUp: "2026-10-05 15:20",
      depotIn: "2026-10-05 18:15",
      depotOut: "2026-10-05 22:05",
      hubIn: "2026-10-07 03:20",
    },
  }),
  groupageShipment({
    id: "EST-4143",
    orderRef: "71225",
    siteId: "ZAZ",
    consignee: CONSIGNEES.colomiersDepot,
    committed: "2026-10-07",
    incoterm: "CPT",
    cargo: { description: "MV pumps", packages: "6 pallets", grossWeightKg: 2200 },
    sendungsnr: "EVS-88104689",
    depot: ZARAGOZA,
    hub: TOULOUSE,
    plan: {
      booked: "2026-10-01 09:00",
      pickedUp: "2026-10-05 14:00",
      depotIn: "2026-10-05 17:00",
      depotOut: "2026-10-05 21:00",
      hubIn: "2026-10-06 06:00",
      hubOut: "2026-10-07 13:30",
      outForDelivery: "2026-10-07 14:00",
      delivered: "2026-10-07 17:00",
    },
    actual: {
      booked: "2026-10-01 09:20",
      pickedUp: "2026-10-05 14:10",
      depotIn: "2026-10-05 17:05",
      depotOut: "2026-10-05 21:10",
      hubIn: "2026-10-06 05:40",
      hubOut: "2026-10-07 13:25",
      outForDelivery: "2026-10-07 14:10",
    },
  }),
  groupageShipment({
    id: "EST-4149",
    orderRef: "71231",
    siteId: "BIO",
    consignee: CONSIGNEES.saintPriestHq,
    committed: "2026-10-14",
    incoterm: "CPT",
    cargo: { description: "VG valves", packages: "5 pallets", grossWeightKg: 1900 },
    sendungsnr: "EVS-88104733",
    depot: BILBAO,
    hub: LYON,
    plan: {
      booked: "2026-10-06 11:00",
      pickedUp: "2026-10-08 15:00",
      depotIn: "2026-10-08 18:00",
      depotOut: "2026-10-08 22:00",
      hubIn: "2026-10-09 23:00",
      hubOut: "2026-10-12 05:00",
      outForDelivery: "2026-10-12 07:30",
      delivered: "2026-10-12 11:00",
    },
    actual: { booked: "2026-10-06 11:15" },
  }),
];
