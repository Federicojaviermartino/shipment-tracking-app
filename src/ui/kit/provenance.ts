import { assertNever } from "./assert-never";

/**
 * Where a date or a status comes from. `confirmed`, `declared` and `estimated` are the
 * three provenance classes of the domain (operator fact, operator estimate, Estela's
 * model); `planned` and `committed` are the two dates nobody asserted.
 */
export type ProvenanceKind = "confirmed" | "declared" | "estimated" | "planned" | "committed";

export type Audience = "ops" | "customer";

export type ProvenanceWords = {
  label: string;
  /** Who stands behind the value, for an audience that is not shown the source by name. */
  by?: string;
};

export function provenanceWords(kind: ProvenanceKind, audience: Audience): ProvenanceWords {
  switch (kind) {
    case "confirmed":
      return { label: "Confirmed" };
    case "declared":
      return audience === "ops"
        ? { label: "Operator estimate" }
        : { label: "Estimated", by: "by the carrier" };
    case "estimated":
      return audience === "ops"
        ? { label: "Estela estimate" }
        : { label: "Estimated", by: "by Ibón logistics" };
    case "planned":
      return { label: "Planned" };
    case "committed":
      return { label: "Committed" };
    default:
      return assertNever(kind);
  }
}

/**
 * The words under a date: the label, then the detail the caller has (source, age, window)
 * or, failing that, who stands behind the value.
 */
export function provenanceCaption(kind: ProvenanceKind, audience: Audience, detail?: string) {
  const { label, by } = provenanceWords(kind, audience);
  return [label, detail ?? by].filter(Boolean).join(" · ");
}
