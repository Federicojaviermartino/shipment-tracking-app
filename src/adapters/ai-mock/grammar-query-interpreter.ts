import type {
  Interpretation,
  InterpreterContext,
  QueryInterpreter,
} from "@/application/ports/query-interpreter";
import { withoutAccents } from "@/domain/compare";
import type { Health } from "@/domain/exceptions";
import type { ShipmentFilter } from "@/domain/filters";
import type { Country } from "@/domain/shipment";
import type { Stage } from "@/domain/stage";

/**
 * Stands in for a small language model constrained to the filter schema. It is a grammar over
 * dictionaries: fixed words for health, stage and period, plus the vocabulary of the asker's
 * perimeter (accounts, sites, operators, vessels). It can only produce a filter, a reference to
 * look up, or a refusal; whatever it does not recognise is handed back as "not used".
 */

type Effect = (filter: ShipmentFilter) => void;
type Entry = { phrase: string; apply: Effect };

const HEALTH_ORDER: Health[] = ["held", "delayed", "at_risk", "stale", "on_time", "delivered"];

function fold(text: string): string {
  return withoutAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function health(...kinds: Health[]): Effect {
  return (filter) => {
    const merged = new Set([...(filter.health ?? []), ...kinds]);
    filter.health = HEALTH_ORDER.filter((kind) => merged.has(kind));
  };
}

function stage(kind: Stage): Effect {
  return (filter) => {
    filter.stage = [...new Set([...(filter.stage ?? []), kind])];
  };
}

const customsHold: Effect = (filter) => {
  filter.customsHold = true;
};
const open: Effect = (filter) => {
  filter.delivered = false;
};
const due = (period: NonNullable<ShipmentFilter["due"]>): Effect => {
  return (filter) => {
    filter.due = period;
  };
};

const FIXED: Entry[] = [
  ...["stuck in customs", "held at customs", "held by customs", "customs hold", "in customs"].map(
    (phrase) => ({ phrase, apply: customsHold }),
  ),
  // "Late" is what a person says for both: declared late and predicted late.
  ...["running late", "behind schedule", "late", "delayed"].map((phrase) => ({
    phrase,
    apply: health("delayed", "at_risk"),
  })),
  { phrase: "at risk", apply: health("at_risk") },
  { phrase: "on hold", apply: health("held") },
  { phrase: "held", apply: health("held") },
  { phrase: "no signal", apply: health("stale") },
  { phrase: "stale", apply: health("stale") },
  { phrase: "silent", apply: health("stale") },
  { phrase: "on time", apply: health("on_time") },
  { phrase: "on plan", apply: health("on_time") },
  ...["not delivered", "undelivered", "in progress", "open", "active"].map((phrase) => ({
    phrase,
    apply: open,
  })),
  {
    phrase: "delivered",
    apply: (filter) => {
      filter.delivered = true;
    },
  },
  { phrase: "out for delivery", apply: stage("out_for_delivery") },
  { phrase: "at sea", apply: stage("at_sea") },
  { phrase: "in transit", apply: stage("in_transit") },
  { phrase: "booked", apply: stage("booked") },
  { phrase: "today", apply: due("today") },
  { phrase: "this week", apply: due("this_week") },
  { phrase: "next week", apply: due("next_week") },
];

const COUNTRY_WORDS: Record<Country, string[]> = {
  ES: ["spain", "spanish"],
  FR: ["france", "french"],
  DE: ["germany", "german"],
  MX: ["mexico", "mexican"],
};

/** Words that carry no constraint: leaving them out is not worth telling the user about. */
const STOP_WORDS = new Set(
  (
    "a an the to from for on in at of with by and or any anything all show me list find search " +
    "what whats which that is are was s do did does have has there us we our it its be been " +
    "going happening status shipment shipments order orders delivery deliveries cargo load loads " +
    "please currently now still where when how much many about"
  ).split(" "),
);

/** Too short to stand for a company on its own, such as the "Ibón" every company name shares. */
const MIN_NAME_WORD = 5;

/** What Estela does not hold, and the noun phrase the refusal uses for it. */
const UNSUPPORTED: { pattern: RegExp; topic: string }[] = [
  { pattern: /\b(duty|duties|tariffs?|import tax(es)?)\b/, topic: "duty amounts" },
  { pattern: /\binvoice (amounts?|totals?|values?)\b/, topic: "invoice amounts" },
  { pattern: /\b(prices?|pricing)\b/, topic: "prices" },
  { pattern: /\b(costs?|charges|freight rates?)\b/, topic: "transport costs" },
];

const REFERENCES: RegExp[] = [
  /\b(EST-\d+)\b/i,
  /\border\s*(?:no\.?|number|#)?\s*(\d{3,})\b/i,
  /\b([A-Z]{3}-\d{2}-\d{5}|[A-Z]{3}-\d{5,}|[A-Z]{4}\d{7})\b/i,
  /(?:^|[^\w-])(\d{5,})\b/,
];

function referenceIn(text: string): string | undefined {
  for (const pattern of REFERENCES) {
    const found = pattern.exec(text)?.[1];
    if (found) return found.toUpperCase();
  }
  return undefined;
}

/** Each name in full, plus every word of it that no other name of the list shares. */
function nameEntries<Item>(
  items: readonly Item[],
  namesOf: (item: Item) => string[],
  apply: (item: Item) => Effect,
): Entry[] {
  const owners = new Map<string, Set<Item>>();
  for (const item of items) {
    for (const word of namesOf(item).flatMap((name) => fold(name).split(" "))) {
      owners.set(word, (owners.get(word) ?? new Set()).add(item));
    }
  }
  return items.flatMap((item) => {
    const names = namesOf(item).map(fold).filter(Boolean);
    const words = names
      .flatMap((name) => name.split(" "))
      .filter((word) => word.length >= MIN_NAME_WORD && owners.get(word)?.size === 1);
    return [...new Set([...names, ...words])].map((phrase) => ({ phrase, apply: apply(item) }));
  });
}

function vocabulary(context: InterpreterContext): Entry[] {
  const countries = context.countries.flatMap((country) =>
    COUNTRY_WORDS[country].map((phrase): Entry => ({
      phrase,
      apply: (filter) => {
        filter.destinationCountry = country;
      },
    })),
  );
  const vessels = nameEntries(
    context.vessels,
    (vessel) => [vessel],
    (vessel) => (filter) => {
      filter.vessel = vessel;
    },
  );
  const sites = nameEntries(
    context.sites,
    (site) => [site.name, ...site.aliases],
    (site) => (filter) => {
      filter.originSiteId = site.id;
    },
  );
  const accounts = nameEntries(
    context.accounts,
    (account) => [account.name],
    (account) => (filter) => {
      filter.accountId = account.id;
    },
  );
  const operators = nameEntries(
    context.operators,
    (operator) => [operator.name],
    (operator) => (filter) => {
      filter.operatorId = operator.id;
    },
  );
  // Longest phrase first, so "noray altair" is a vessel before "noray" is a shipping line.
  return [...FIXED, ...vessels, ...countries, ...sites, ...accounts, ...operators].sort(
    (a, b) => b.phrase.split(" ").length - a.phrase.split(" ").length,
  );
}

function interpret(text: string, context: InterpreterContext): Interpretation {
  const lower = text.toLowerCase();
  const reference = referenceIn(text);

  const unsupported = UNSUPPORTED.find(({ pattern }) => pattern.test(lower));
  if (unsupported) {
    return { kind: "unsupported", topic: unsupported.topic, ...(reference ? { reference } : {}) };
  }
  if (reference) return { kind: "lookup", reference };

  const words = fold(text).split(" ").filter(Boolean);
  const taken = words.map(() => false);
  const filter: ShipmentFilter = {};
  let recognised = 0;

  for (const entry of vocabulary(context)) {
    const phrase = entry.phrase.split(" ");
    const at = words.findIndex((_, start) =>
      phrase.every((word, offset) => words[start + offset] === word && !taken[start + offset]),
    );
    if (at < 0) continue;
    phrase.forEach((_, offset) => {
      taken[at + offset] = true;
    });
    entry.apply(filter);
    recognised += 1;
  }

  if (recognised === 0) return { kind: "not_understood" };
  const notUsed = words.filter((word, index) => !taken[index] && !STOP_WORDS.has(word));
  return { kind: "filter", filter, notUsed: [...new Set(notUsed)] };
}

export const grammarQueryInterpreter: QueryInterpreter = {
  interpret: (text, context) => Promise.resolve(interpret(text, context)),
};
