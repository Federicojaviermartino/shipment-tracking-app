import type { OperatorAdapter } from "@/application/ports/operator-adapter";
import { cierzoAdapter } from "./cierzo/adapter";
import { eisvogelAdapter } from "./eisvogel/adapter";
import { norayAdapter } from "./noray/adapter";
import { turiaAdapter } from "./turia/adapter";

export { cierzoAdapter, eisvogelAdapter, norayAdapter, turiaAdapter };

/** One adapter per operator feed. Ingestion picks the adapter by `raw.operatorId`. */
export const OPERATOR_ADAPTERS: readonly OperatorAdapter[] = [
  cierzoAdapter,
  eisvogelAdapter,
  norayAdapter,
  turiaAdapter,
];
