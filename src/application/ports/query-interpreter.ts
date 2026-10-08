import type { ShipmentFilter } from "@/domain/filters";
import type { AccountId, Country, OperatorId, SiteId } from "@/domain/shipment";
import type { Instant } from "@/domain/time";

/** The vocabulary of the asker's perimeter, and nothing else: a model cannot name what it never saw. */
export type InterpreterContext = {
  now: Instant;
  countries: Country[];
  accounts: { id: AccountId; name: string }[];
  sites: { id: SiteId; name: string; aliases: string[] }[];
  operators: { id: OperatorId; name: string }[];
  vessels: string[];
};

/**
 * What a question means, as data. A filter runs through the deterministic filter inside the
 * asker's perimeter; a lookup is resolved by code; `topic` is a noun phrase for what Estela does
 * not hold ("duty amounts").
 */
export type Interpretation =
  | { kind: "filter"; filter: ShipmentFilter; notUsed: string[] }
  | { kind: "lookup"; reference: string }
  | { kind: "unsupported"; reference?: string; topic: string }
  | { kind: "not_understood" };

/** Natural language to a filter, a lookup, or an honest refusal. Never to a result. */
export interface QueryInterpreter {
  interpret(text: string, context: InterpreterContext): Promise<Interpretation>;
}
