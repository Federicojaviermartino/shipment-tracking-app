import type { ShipmentId } from "@/domain/shipment";
import type { Interpretation } from "./query-interpreter";

/**
 * The evaluation set of the query interpreter, kept as data next to its port: each question, what
 * it must be read as, and what `ask` then answers to the logistics lead in the demo world at T0.
 * The same cases run against the grammar that stands in for the model today and against whatever
 * adapter replaces it. The first ones double as the suggestions of the ask bar: what is offered
 * is what is tested.
 */
export type QueryCase = {
  query: string;
  interpretation: Interpretation;
  answer:
    | { kind: "filter"; shipmentIds: ShipmentId[] }
    | { kind: "answer"; shipmentId: ShipmentId; statusLine: string }
    | { kind: "unsupported"; shipmentId: ShipmentId | null; message: string }
    | { kind: "not_understood"; shipmentIds: ShipmentId[] };
};

export const QUERY_CASES: QueryCase[] = [
  {
    query: "shipments to France this week running late",
    interpretation: {
      kind: "filter",
      filter: { destinationCountry: "FR", due: "this_week", health: ["delayed", "at_risk"] },
      notUsed: [],
    },
    answer: { kind: "filter", shipmentIds: ["EST-4134"] },
  },
  {
    query: "what's going on with order 12345?",
    interpretation: { kind: "lookup", reference: "12345" },
    answer: {
      kind: "answer",
      shipmentId: "EST-4058",
      statusLine:
        "At sea on NORAY ALTAIR 612W, due in Veracruz Fri 9 Oct (operator estimate, Noray Lines). Delivery in Querétaro Wed 14 Oct (operator estimate, Turia Global Forwarding), one day inside the committed date.",
    },
  },
  {
    query: "anything stuck in customs?",
    interpretation: { kind: "filter", filter: { customsHold: true }, notUsed: [] },
    answer: { kind: "filter", shipmentIds: ["EST-4012"] },
  },
  {
    query: "open shipments from Bilbao",
    interpretation: {
      kind: "filter",
      filter: { originSiteId: "BIO", delivered: false },
      notUsed: [],
    },
    answer: { kind: "filter", shipmentIds: ["EST-4012", "EST-4136", "EST-4141", "EST-4149"] },
  },
  {
    query: "what's on the Noray Altair?",
    interpretation: { kind: "filter", filter: { vessel: "NORAY ALTAIR" }, notUsed: [] },
    answer: { kind: "filter", shipmentIds: ["EST-4058", "EST-4063"] },
  },
  {
    query: "late deliveries for Vauclair",
    interpretation: {
      kind: "filter",
      filter: { accountId: "VAU", health: ["delayed", "at_risk"] },
      notUsed: [],
    },
    answer: { kind: "filter", shipmentIds: ["EST-4134"] },
  },
  {
    // "Urgent" is not something the record knows: it is handed back, never guessed at.
    query: "urgent shipments to Germany",
    interpretation: {
      kind: "filter",
      filter: { destinationCountry: "DE" },
      notUsed: ["urgent"],
    },
    answer: { kind: "filter", shipmentIds: ["EST-4107", "EST-4111", "EST-4127", "EST-4136"] },
  },
  {
    query: "how much duty did we pay on order 48190?",
    interpretation: { kind: "unsupported", topic: "duty amounts", reference: "48190" },
    answer: {
      kind: "unsupported",
      shipmentId: "EST-4019",
      message:
        "Estela holds tracking and documents, not duty amounts. Order 48190 is EST-4019, delivered Thu 1 Oct.",
    },
  },
  {
    query: "asdf qwerty",
    interpretation: { kind: "not_understood" },
    answer: { kind: "not_understood", shipmentIds: [] },
  },
];

/** How many of the cases the ask bar offers when it is focused and empty. */
export const SUGGESTED_QUERIES = QUERY_CASES.slice(0, 5).map((item) => item.query);
