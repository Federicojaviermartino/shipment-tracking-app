import { assertNever } from "@/domain/assert-never";
import { applyFilter } from "@/domain/filters";
import type { ShipmentProjection } from "@/domain/projection";
import { operatorsOf, type Shipment } from "@/domain/shipment";
import type { ReadContext } from "./context";
import { sourceName } from "./directory";
import type {
  Interpretation,
  InterpreterContext,
  QueryInterpreter,
} from "./ports/query-interpreter";
import { describeFilter } from "./text/filter-text";
import { shortStatus, statusLine } from "./text/status-line";
import type { AskResult, OpsRow } from "./views";

/** The words of the asker's perimeter, and nothing else: what the interpreter is allowed to know. */
export function vocabularyOf(
  context: ReadContext,
  shipments: readonly Shipment[],
): InterpreterContext {
  const { directory, now } = context;
  const unique = <Value>(values: Value[]) => [...new Set(values)];
  const siteIds = unique(shipments.map((shipment) => shipment.originSiteId));
  const accountIds = unique(shipments.map((shipment) => shipment.accountId));
  return {
    now,
    countries: unique(shipments.map((shipment) => shipment.consignee.place.country)),
    accounts: directory.accounts
      .filter((account) => accountIds.includes(account.id))
      .map((account) => ({ id: account.id, name: account.name })),
    sites: directory.sites
      .filter((site) => siteIds.includes(site.id))
      .map((site) => ({ id: site.id, name: site.name, aliases: site.aliases })),
    operators: unique(shipments.flatMap(operatorsOf)).map((id) => ({
      id,
      name: sourceName(directory, id),
    })),
    vessels: unique(shipments.flatMap((shipment) => shipment.voyage?.vessel ?? [])),
  };
}

function matches(shipment: Shipment, reference: string): boolean {
  const wanted = reference.toUpperCase();
  return [
    shipment.id,
    shipment.orderRef,
    shipment.cargo.container?.number ?? "",
    ...shipment.refs.map((ref) => ref.value),
  ].some((value) => value.toUpperCase() === wanted);
}

/** The same sentence whether the reference is unknown or merely out of the asker's perimeter. */
function notFound(reference: string): string {
  const kind = /^EST-/i.test(reference) ? "shipment" : "order";
  return `No ${kind} ${reference} in your shipments.`;
}

/**
 * Interprets a question and answers it deterministically. The interpreter only ever returns data:
 * a filter runs through the same filter as the manual chips, over rows that are already scoped;
 * a reference is looked up among them and nowhere else; a failure of the interpreter falls back
 * to a plain text match.
 */
export async function answerQuestion(input: {
  text: string;
  context: ReadContext;
  interpreter: QueryInterpreter;
  /** The asker's shipments, in the order rows are listed. */
  scoped: readonly ShipmentProjection[];
  toRow: (projection: ShipmentProjection) => OpsRow;
}): Promise<AskResult> {
  const { text, context, interpreter, scoped, toRow } = input;
  const vocabulary = vocabularyOf(
    context,
    scoped.map((row) => row.shipment),
  );

  let interpretation: Interpretation;
  try {
    interpretation = await interpreter.interpret(text, vocabulary);
  } catch {
    interpretation = { kind: "not_understood" };
  }

  const find = (reference: string | undefined) =>
    reference ? scoped.find((row) => matches(row.shipment, reference)) : undefined;

  switch (interpretation.kind) {
    case "filter":
      return {
        kind: "filter",
        filter: interpretation.filter,
        chips: describeFilter(interpretation.filter, vocabulary, context.now),
        notUsed: interpretation.notUsed,
        rows: applyFilter(scoped, interpretation.filter, context.now).map(toRow),
      };
    case "lookup": {
      const found = find(interpretation.reference);
      if (!found) {
        return {
          kind: "not_found",
          reference: interpretation.reference,
          message: notFound(interpretation.reference),
        };
      }
      return {
        kind: "answer",
        shipmentId: found.shipment.id,
        statusLine: statusLine(context, found),
        row: toRow(found),
      };
    }
    case "unsupported": {
      const found = find(interpretation.reference);
      const refusal = `Estela holds tracking and documents, not ${interpretation.topic}.`;
      return {
        kind: "unsupported",
        shipmentId: found?.shipment.id ?? null,
        message: found
          ? `${refusal} Order ${found.shipment.orderRef} is ${found.shipment.id}, ${shortStatus(found)}.`
          : refusal,
      };
    }
    case "not_understood":
      return {
        kind: "not_understood",
        text,
        message: `Couldn't turn that into filters. Showing text matches for "${text}".`,
        rows: applyFilter(scoped, { text }, context.now).map(toRow),
      };
    default:
      return assertNever(interpretation);
  }
}
