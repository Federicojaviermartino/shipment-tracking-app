import { describe, expect, test } from "vitest";
import type { InterpreterContext, QueryInterpreter } from "@/application/ports/query-interpreter";
import { QUERY_CASES } from "@/application/ports/query-interpreter.cases";
import { ACCOUNTS, OPERATORS, SITES, T0 } from "@/fixtures";
import { grammarQueryInterpreter } from "./grammar-query-interpreter";

/** The vocabulary of someone who sees the whole demo world. */
const EVERYTHING: InterpreterContext = {
  now: T0,
  countries: ["ES", "FR", "DE", "MX"],
  accounts: ACCOUNTS.map((account) => ({ id: account.id, name: account.name })),
  sites: SITES.map((site) => ({ id: site.id, name: site.name, aliases: site.aliases })),
  operators: OPERATORS.map((operator) => ({ id: operator.id, name: operator.name })),
  vessels: ["NORAY VEGA", "NORAY CASTOR", "NORAY ALTAIR", "NORAY DENEB"],
};

/**
 * The cases are data and the runner takes a port: pointing `interpreter` at another adapter turns
 * this file into its offline evaluation.
 */
const interpreter: QueryInterpreter = grammarQueryInterpreter;
const interpret = (text: string, context = EVERYTHING) => interpreter.interpret(text, context);

describe("the query cases", () => {
  test.each(QUERY_CASES)("$query", async ({ query, interpretation }) => {
    expect(await interpret(query)).toEqual(interpretation);
  });
});

describe("the grammar", () => {
  test("reads health, stage and period words", async () => {
    expect(await interpret("at risk next week")).toEqual({
      kind: "filter",
      filter: { health: ["at_risk"], due: "next_week" },
      notUsed: [],
    });
    expect(await interpret("held or delayed, at sea")).toMatchObject({
      filter: { health: ["held", "delayed", "at_risk"], stage: ["at_sea"] },
    });
    expect(await interpret("delivered today")).toMatchObject({
      filter: { delivered: true, due: "today" },
    });
    expect(await interpret("not delivered")).toMatchObject({ filter: { delivered: false } });
    expect(await interpret("anything stale?")).toMatchObject({ filter: { health: ["stale"] } });
  });

  test("the longest phrase wins: a vessel before the line it belongs to, a customs hold before a hold", async () => {
    expect(await interpret("Noray Altair")).toMatchObject({ filter: { vessel: "NORAY ALTAIR" } });
    expect(await interpret("everything with Noray")).toMatchObject({
      filter: { operatorId: "NRY" },
    });
    expect(await interpret("held at customs")).toEqual({
      kind: "filter",
      filter: { customsHold: true },
      notUsed: [],
    });
    expect(await interpret("out for delivery")).toMatchObject({
      filter: { stage: ["out_for_delivery"] },
    });
  });

  test("knows sites by their aliases and accounts and operators by a distinctive word, whatever the accents or case", async () => {
    expect(await interpret("from ABADINO")).toMatchObject({ filter: { originSiteId: "BIO" } });
    expect(await interpret("from Riba-roja")).toMatchObject({ filter: { originSiteId: "VLC" } });
    expect(await interpret("aquabajio shipments")).toMatchObject({ filter: { accountId: "AQB" } });
    expect(await interpret("Ibón Deutschland")).toMatchObject({ filter: { accountId: "IDE" } });
    expect(await interpret("with Eisvogel to Germany")).toMatchObject({
      filter: { operatorId: "EVS", destinationCountry: "DE" },
    });
    expect(await interpret("german deliveries")).toMatchObject({
      filter: { destinationCountry: "DE" },
    });
  });

  test("a word every name shares identifies none of them", async () => {
    // "Ibón" is the manufacturer and part of a subsidiary's name: on its own it filters nothing.
    expect(await interpret("ibon shipments late")).toEqual({
      kind: "filter",
      filter: { health: ["delayed", "at_risk"] },
      notUsed: ["ibon"],
    });
  });

  test("what it does not recognise is handed back, never guessed at", async () => {
    expect(await interpret("important fragile shipments to France")).toEqual({
      kind: "filter",
      filter: { destinationCountry: "FR" },
      notUsed: ["important", "fragile"],
    });
    expect(await interpret("shipments")).toEqual({ kind: "not_understood" });
    expect(await interpret("")).toEqual({ kind: "not_understood" });
  });

  test("can only name what is in the asker's vocabulary", async () => {
    const narrow: InterpreterContext = {
      ...EVERYTHING,
      countries: ["ES"],
      accounts: EVERYTHING.accounts.filter((account) => account.id === "THA"),
      vessels: [],
    };
    expect(await interpret("late deliveries for Vauclair", narrow)).toEqual({
      kind: "filter",
      filter: { health: ["delayed", "at_risk"] },
      notUsed: ["vauclair"],
    });
    expect(await interpret("to France", narrow)).toEqual({ kind: "not_understood" });
    expect(await interpret("what's on the Altair?", narrow)).toEqual({ kind: "not_understood" });
  });

  test("a reference is a lookup, with or without a question around it", async () => {
    for (const [text, reference] of [
      ["12345", "12345"],
      ["order 12345", "12345"],
      ["where is order #48176?", "48176"],
      ["EST-4058", "EST-4058"],
      ["status of est-4012 please", "EST-4012"],
      ["TGF-26-03412", "TGF-26-03412"],
      ["container NRYU4821373", "NRYU4821373"],
      ["CRZ-2290311 late?", "CRZ-2290311"],
    ]) {
      expect(await interpret(text ?? ""), text).toEqual({ kind: "lookup", reference });
    }
  });

  test("a year or a small number is not a reference", async () => {
    expect(await interpret("shipments to France in 2026")).toMatchObject({
      kind: "filter",
      notUsed: ["2026"],
    });
  });

  test("questions about what Estela does not hold are refused by topic, with the reference if there is one", async () => {
    expect(await interpret("what did the freight cost for order 48190")).toEqual({
      kind: "unsupported",
      topic: "transport costs",
      reference: "48190",
    });
    expect(await interpret("prices for Vauclair")).toEqual({
      kind: "unsupported",
      topic: "prices",
    });
    expect(await interpret("invoice amount of EST-4058")).toEqual({
      kind: "unsupported",
      topic: "invoice amounts",
      reference: "EST-4058",
    });
  });
});
