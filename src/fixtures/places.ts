import type { Country, Place } from "@/domain/shipment";
import { ZONE_OF_COUNTRY } from "@/domain/shipment";

function place(name: string, country: Country, locode?: string): Place {
  return { name, country, zone: ZONE_OF_COUNTRY[country], ...(locode ? { locode } : {}) };
}

// Origin sites.
export const ZARAGOZA = place("Zaragoza", "ES");
export const ABADINO = place("Abadiño", "ES");
export const RIBA_ROJA = place("Riba-roja de Túria", "ES");

// Ports of the Valencia to Veracruz service.
export const VALENCIA_PORT = place("Valencia", "ES", "ESVLC");
export const VERACRUZ_PORT = place("Veracruz", "MX", "MXVER");

// Consignee towns.
export const QUERETARO = place("Querétaro", "MX");
export const SAN_JUAN_DEL_RIO = place("San Juan del Río", "MX");
export const SAINT_PRIEST = place("Saint-Priest", "FR");
export const COLOMIERS = place("Colomiers", "FR");
export const MANNHEIM = place("Mannheim", "DE");
export const MURCIA = place("Murcia", "ES");
export const EL_EJIDO = place("El Ejido", "ES");
export const SEVILLA = place("Sevilla", "ES");
export const MALAGA = place("Málaga", "ES");

// Carrier platforms, depots and hubs that are not also a consignee town.
export const ALMERIA = place("Almería", "ES");
export const TERUEL = place("Teruel", "ES");
export const VALENCIA = place("Valencia", "ES");
export const BILBAO = place("Bilbao", "ES");
export const PERPIGNAN = place("Perpignan", "FR");
export const LYON = place("Lyon", "FR");
export const TOULOUSE = place("Toulouse", "FR");
