import { clsx } from "clsx";
import { assertNever } from "./assert-never";
import { type Audience, type ProvenanceKind, provenanceWords } from "./provenance";

const COLOR: Record<ProvenanceKind, string> = {
  confirmed: "text-ink-900",
  declared: "text-ink-900",
  estimated: "text-ai-600",
  planned: "text-ink-500",
  committed: "text-ink-900",
};

function Shape({ kind }: { kind: ProvenanceKind }) {
  switch (kind) {
    case "confirmed":
      return <circle cx="6" cy="6" r="4" fill="currentColor" />;
    case "declared":
      return <circle cx="6" cy="6" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />;
    case "estimated":
      return (
        <path
          d="M6 1.75 10.25 6 6 10.25 1.75 6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      );
    case "planned":
      return <circle cx="6" cy="6" r="2" fill="currentColor" />;
    case "committed":
      return <rect x="4" y="1" width="4" height="10" fill="currentColor" />;
    default:
      return assertNever(kind);
  }
}

type ProvenanceMarkProps = {
  kind: ProvenanceKind;
  /** Whose vocabulary the hidden words use. */
  audience?: Audience;
  /**
   * `hidden` keeps the class in words for assistive technology, so a mark beside free text
   * is never the only carrier. Pass `none` only where the label is printed next to it.
   */
  words?: "hidden" | "none";
  /** The value was overtaken by newer information: the mark steps back. */
  muted?: boolean;
  size?: number;
  className?: string;
};

/** The glyph of a provenance class: filled means it happened, hollow that somebody expects it. */
export function ProvenanceMark({
  kind,
  audience = "ops",
  words = "hidden",
  muted = false,
  size = 12,
  className,
}: ProvenanceMarkProps) {
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        width={size}
        height={size}
        className={clsx("shrink-0", muted ? "text-ink-500" : COLOR[kind], className)}
      >
        <Shape kind={kind} />
      </svg>
      {words === "hidden" && (
        <span className="sr-only">{provenanceWords(kind, audience).label}: </span>
      )}
    </>
  );
}
