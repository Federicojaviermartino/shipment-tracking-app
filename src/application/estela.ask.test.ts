import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { QUERY_CASES, SUGGESTED_QUERIES } from "./ports/query-interpreter.cases";
import type { AskResult } from "./views";

/**
 * The query cases, through `ask`: what the logistics lead is answered in the demo world at T0.
 * The interpreter only ever returns data; the rows, the status line and the refusals asserted
 * here are composed by code.
 */

function summary(result: AskResult): unknown {
  switch (result.kind) {
    case "filter":
      return { kind: "filter", shipmentIds: result.rows.map((row) => row.id).sort() };
    case "answer":
      return { kind: "answer", shipmentId: result.shipmentId, statusLine: result.statusLine };
    case "unsupported":
      return { kind: "unsupported", shipmentId: result.shipmentId, message: result.message };
    case "not_understood":
      return { kind: "not_understood", shipmentIds: result.rows.map((row) => row.id).sort() };
    case "not_found":
      return { kind: "not_found", reference: result.reference };
  }
}

describe("ask", () => {
  test.each(QUERY_CASES)("$query", async ({ query, interpretation, answer }) => {
    const { estela, marta } = await startEstela();
    const result = await estela.ops.ask(marta, query);
    expect(summary(result)).toEqual(answer);
    if (result.kind === "filter" && interpretation.kind === "filter") {
      expect(result.filter).toEqual(interpretation.filter);
      expect(result.notUsed).toEqual(interpretation.notUsed);
    }
  });

  test("a filter comes back as chips with resolved values, and says what was not used", async () => {
    const { estela, marta } = await startEstela();
    const late = await estela.ops.ask(marta, "shipments to France this week running late");
    expect(late.kind === "filter" && late.chips).toEqual([
      { field: "destinationCountry", label: "Destination: France" },
      { field: "health", label: "Health: Delayed or At risk" },
      { field: "due", label: "Due: this week, 5–11 Oct" },
    ]);
    const urgent = await estela.ops.ask(marta, "urgent shipments to Germany");
    expect(urgent.kind === "filter" && urgent.notUsed).toEqual(["urgent"]);
  });

  test("a filter read from a question gives the same rows as the same filter set by hand", async () => {
    const { estela, marta } = await startEstela();
    const asked = await estela.ops.ask(marta, "open shipments from Bilbao");
    if (asked.kind !== "filter") throw new Error("Expected a filter");
    const manual = await estela.ops.shipments(marta, { view: "all", filter: asked.filter });
    expect(asked.rows).toEqual(manual);
  });

  test("a text that is not understood falls back to a plain text match and says so", async () => {
    const { estela, marta } = await startEstela();
    expect(await estela.ops.ask(marta, "asdf qwerty")).toEqual({
      kind: "not_understood",
      text: "asdf qwerty",
      message: 'Couldn\'t turn that into filters. Showing text matches for "asdf qwerty".',
      rows: [],
    });
  });

  test("an interpreter that fails also falls back to a plain text match", async () => {
    const { estela, marta } = await startEstela({
      ai: { queryInterpreter: { interpret: () => Promise.reject(new Error("model down")) } },
    });
    const result = await estela.ops.ask(marta, "NRYU4821373");
    expect(result.kind === "not_understood" && result.rows.map((row) => row.id)).toEqual([
      "EST-4058",
    ]);
  });

  test("a lookup works by shipment id, container and operator reference as well", async () => {
    const { estela, marta } = await startEstela();
    for (const reference of ["EST-4058", "est-4058", "NRYU4821373", "TGF-26-03412"]) {
      const result = await estela.ops.ask(marta, reference);
      expect(result.kind === "answer" && result.shipmentId, reference).toBe("EST-4058");
    }
  });

  test("a lookup needs the whole reference: part of an order number finds nothing", async () => {
    const { estela, marta } = await startEstela();
    expect(await estela.ops.ask(marta, "order 1234")).toEqual({
      kind: "not_found",
      reference: "1234",
      message: "No order 1234 in your shipments.",
    });
    expect((await estela.ops.ask(marta, "EST-405")).kind).toBe("not_found");
  });

  test("the answer to a lookup names an open case, so that a held shipment is not summed up by its dates", async () => {
    const { estela, marta } = await startEstela();
    const result = await estela.ops.ask(marta, "order 48176");
    expect(result.kind === "answer" && result.statusLine).toBe(
      "At the port of Veracruz, held at import customs. Delivery in Querétaro Fri 9 Oct (Estela estimate), on the committed date. Held: Read by AI from Turia Global Forwarding's email: customs found a gross-weight discrepancy between the commercial invoice (4,180 kg) and the bill of lading (4,810 kg); a corrected invoice is required.",
    );
  });

  test("the answer says on which side of the committed date the delivery falls", async () => {
    const { estela, marta } = await startEstela();
    const late = await estela.ops.ask(marta, "order 20561");
    expect(late.kind === "answer" && late.statusLine).toBe(
      "In transit, last reported at Zaragoza Tue 6 Oct 11:30. Delivery in Murcia Thu 8 Oct (operator estimate, Transportes Cierzo), two days after the committed date. Delayed: Transportes Cierzo declares delivery Thu 8 Oct, two days after the committed Tue 6 Oct.",
    );
    const onTheDay = await estela.ops.ask(marta, "order 20570");
    expect(onTheDay.kind === "answer" && onTheDay.statusLine).toBe(
      "In transit, last reported at Abadiño Tue 6 Oct 17:00. Delivery in Murcia Thu 8 Oct (Estela estimate), on the committed date.",
    );
    const delivered = await estela.ops.ask(marta, "order 48190");
    expect(delivered.kind === "answer" && delivered.statusLine).toBe(
      "Delivered in San Juan del Río Thu 1 Oct (confirmed, Turia Global Forwarding), one day inside the committed date.",
    );
  });

  test("the ask bar suggests questions that are in the evaluation set", async () => {
    const { estela, marta } = await startEstela();
    const { suggestions } = await estela.ops.overview(marta);
    expect(suggestions).toEqual(SUGGESTED_QUERIES);
    expect(suggestions).toContain("shipments to France this week running late");
    expect(suggestions).toContain("what's going on with order 12345?");
  });
});
