import type { Account, Operator, Site } from "@/domain/directory";
import type { Actor } from "@/domain/perimeter";
import {
  IBON,
  type AccountId,
  type OperatorId,
  type Shipment,
  type SiteId,
  type Source,
  type UserId,
} from "@/domain/shipment";

/**
 * The master data the application reads but never changes: who ships, with whom, to whom, and
 * who may look. In the prototype it comes from the fixtures; behind a backend it would be tables.
 */
export type Directory = {
  /** The manufacturer's name: the words for the source `IBON`. */
  manufacturer: string;
  shipments: readonly Shipment[];
  operators: readonly Operator[];
  sites: readonly Site[];
  accounts: readonly Account[];
  actors: readonly Actor[];
};

export function operatorOf(directory: Directory, id: OperatorId): Operator | undefined {
  return directory.operators.find((operator) => operator.id === id);
}

/** A source by name: an operator, or the manufacturer for its own systems and people. */
export function sourceName(directory: Directory, source: Source): string {
  if (source === IBON) return directory.manufacturer;
  return operatorOf(directory, source)?.name ?? source;
}

export function userName(directory: Directory, userId: UserId): string {
  return directory.actors.find((actor) => actor.userId === userId)?.name ?? userId;
}

export function accountOf(directory: Directory, id: AccountId): Account | undefined {
  return directory.accounts.find((account) => account.id === id);
}

export function siteOf(directory: Directory, id: SiteId): Site | undefined {
  return directory.sites.find((site) => site.id === id);
}

const LEGAL_FORMS = new Set(["sas", "gmbh", "sa", "sl", "slu", "ltd", "inc", "bv", "srl"]);

/** "Aquabajío Ingeniería, S.A. de C.V." in running text is "Aquabajío Ingeniería". */
export function shortAccountName(name: string): string {
  const words = (name.split(",")[0] ?? name).trim().split(/\s+/);
  while (
    words.length > 1 &&
    LEGAL_FORMS.has((words.at(-1) ?? "").replace(/\./g, "").toLowerCase())
  ) {
    words.pop();
  }
  return words.join(" ");
}
