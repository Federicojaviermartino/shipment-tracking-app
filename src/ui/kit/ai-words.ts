import { assertNever } from "./assert-never";

/** A model read this from free text. `confirmedBy` names the person who confirmed it. */
export type AiReading = { confirmedBy?: string };

/**
 * What a model did, and whether a person has reviewed it since. The tag and the look of
 * the mark both follow from it, so the two cannot disagree.
 */
export type AiState =
  { kind: "written" } | { kind: "draft"; edited: boolean } | ({ kind: "reading" } & AiReading);

export type AiWords = {
  tag: string;
  /** A person edited or confirmed the output: the mark leaves the model's colour. */
  reviewed: boolean;
};

export function aiWords(state: AiState): AiWords {
  switch (state.kind) {
    case "written":
      return { tag: "AI", reviewed: false };
    case "draft":
      return state.edited
        ? { tag: "AI draft · edited", reviewed: true }
        : { tag: "AI draft", reviewed: false };
    case "reading":
      return state.confirmedBy === undefined
        ? { tag: "Read by AI, confirm", reviewed: false }
        : { tag: `Read by AI · confirmed by ${state.confirmedBy}`, reviewed: true };
    default:
      return assertNever(state);
  }
}
