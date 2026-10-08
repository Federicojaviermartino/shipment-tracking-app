import type { Account, Operator, Site } from "@/domain/directory";
import type { Actor } from "@/domain/perimeter";
import type { Place } from "@/domain/shipment";
import { CIERZO } from "@/adapters/operators/cierzo/mapping";
import { EISVOGEL } from "@/adapters/operators/eisvogel/mapping";
import { NORAY } from "@/adapters/operators/noray/mapping";
import { TURIA } from "@/adapters/operators/turia/mapping";
import {
  ABADINO,
  COLOMIERS,
  EL_EJIDO,
  MALAGA,
  MANNHEIM,
  MURCIA,
  QUERETARO,
  RIBA_ROJA,
  SAINT_PRIEST,
  SAN_JUAN_DEL_RIO,
  SEVILLA,
  ZARAGOZA,
} from "./places";

/** Ibón Fluid Systems, S.A.: the fictional manufacturer whose shipments these are. */
export const MANUFACTURER = "Ibón Fluid Systems";

export const OPERATORS: Operator[] = [
  { id: CIERZO, name: "Transportes Cierzo", kind: "road_carrier" },
  { id: EISVOGEL, name: "Eisvogel Spedition", kind: "road_carrier" },
  { id: NORAY, name: "Noray Lines", kind: "ocean_carrier" },
  { id: TURIA, name: "Turia Global Forwarding", kind: "forwarder" },
];

export const SITES: Site[] = [
  {
    id: "ZAZ",
    name: "Zaragoza plant",
    role: "factory",
    place: ZARAGOZA,
    aliases: ["Zaragoza", "PLAZA"],
  },
  {
    id: "BIO",
    name: "Abadiño plant",
    role: "factory",
    place: ABADINO,
    aliases: ["Abadiño", "Bilbao", "Bizkaia"],
  },
  {
    id: "VLC",
    name: "Riba-roja warehouse",
    role: "warehouse",
    place: RIBA_ROJA,
    aliases: ["Riba-roja", "Riba-roja de Túria", "Valencia"],
  },
];

export const ACCOUNTS: Account[] = [
  { id: "AQB", name: "Aquabajío Ingeniería, S.A. de C.V.", type: "customer", country: "MX" },
  { id: "VAU", name: "Vauclair Hydraulique SAS", type: "customer", country: "FR" },
  { id: "IDE", name: "Ibón Deutschland GmbH", type: "subsidiary", country: "DE" },
  { id: "THA", name: "Riegos Thader, S.L.", type: "customer", country: "ES" },
  { id: "HIS", name: "Hispalagua Servicios, S.A.", type: "customer", country: "ES" },
];

export type Consignee = { accountId: string; name: string; place: Place };

export const CONSIGNEES = {
  queretaroPlant: { accountId: "AQB", name: "Querétaro plant", place: QUERETARO },
  ptarSanJuan: { accountId: "AQB", name: "PTAR San Juan del Río", place: SAN_JUAN_DEL_RIO },
  saintPriestHq: { accountId: "VAU", name: "Saint-Priest HQ", place: SAINT_PRIEST },
  colomiersDepot: { accountId: "VAU", name: "Colomiers depot", place: COLOMIERS },
  mannheimWarehouse: { accountId: "IDE", name: "Mannheim warehouse", place: MANNHEIM },
  murciaWarehouse: { accountId: "THA", name: "Murcia warehouse", place: MURCIA },
  elEjidoSite: { accountId: "THA", name: "El Ejido site", place: EL_EJIDO },
  sevillaDepot: { accountId: "HIS", name: "Sevilla depot", place: SEVILLA },
  edarMalaga: { accountId: "HIS", name: "EDAR project site, Málaga", place: MALAGA },
} satisfies Record<string, Consignee>;

/** The five demo personas. The first one is the default. */
export const PERSONAS: Actor[] = [
  {
    kind: "internal",
    userId: "marta.soler",
    name: "Marta Soler",
    title: "Logistics Operations Lead",
    role: "logistics",
    siteIds: "all",
    accountIds: "all",
  },
  {
    kind: "internal",
    userId: "iker.zabala",
    name: "Iker Zabala",
    title: "Shipping Coordinator, Abadiño plant",
    role: "logistics",
    siteIds: ["BIO"],
    accountIds: "all",
  },
  {
    kind: "internal",
    userId: "lucia.ferrer",
    name: "Lucía Ferrer",
    title: "Customer Support, key accounts",
    role: "customer_support",
    siteIds: "all",
    accountIds: ["AQB", "VAU"],
  },
  {
    kind: "external",
    userId: "mariana.olvera",
    name: "Mariana Olvera",
    title: "Purchasing Coordinator, Aquabajío",
    accountId: "AQB",
  },
  {
    kind: "external",
    userId: "camille.roussel",
    name: "Camille Roussel",
    title: "Supply Manager, Vauclair",
    accountId: "VAU",
  },
];
