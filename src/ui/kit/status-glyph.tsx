import { clsx } from "clsx";
import { assertNever } from "./assert-never";

/**
 * Punctuality as operations and customers read it. `neutral` is the customer's
 * "in progress": a state that makes no claim about the date.
 */
export type StatusKind =
  "on_time" | "at_risk" | "delayed" | "held" | "stale" | "delivered" | "neutral";

const COLOR: Record<StatusKind, string> = {
  on_time: "text-ontime-600",
  at_risk: "text-atrisk-600",
  delayed: "text-delayed-600",
  held: "text-held-700",
  stale: "text-stale-600",
  delivered: "text-delivered-700",
  neutral: "text-ink-500",
};

const TRIANGLE = "M6 2.25 10.25 9.25H1.75Z";

// Drawn for a 12px box, with edges on whole pixels where a shape allows it: icon-set
// shapes blur at that size. A status inherits the mark of its evidence, so "at risk"
// (estimated) is the hollow twin of "delayed" (declared), and a hold that nobody has
// confirmed is the hollow twin of a hold.
function Shape({ status, unconfirmed }: { status: StatusKind; unconfirmed: boolean }) {
  switch (status) {
    case "on_time":
      return <circle cx="6" cy="6" r="4" fill="currentColor" />;
    case "at_risk":
      return (
        <path
          d={TRIANGLE}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case "delayed":
      return (
        <path
          d={TRIANGLE}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case "held":
      return unconfirmed ? (
        <rect
          x="3"
          y="3"
          width="6"
          height="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : (
        <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
      );
    case "stale":
      return (
        <circle
          cx="6"
          cy="6"
          r="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="3.6 2.683"
          transform="rotate(-25.8 6 6)"
        />
      );
    case "delivered":
      return (
        <path
          d="M2.5 6.5 5 9 10 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "neutral":
      return <rect x="3" y="5" width="6" height="2" rx="1" fill="currentColor" />;
    default:
      return assertNever(status);
  }
}

type StatusGlyphProps = {
  status: StatusKind;
  /**
   * The status rests on a model reading that nobody has confirmed. Only a hold can: it is
   * then drawn hollow, and confirming the reading fills it in.
   */
  unconfirmed?: boolean;
  size?: number;
  /** `inherit` takes the surrounding text colour, for a glyph on a filled surface. */
  color?: "status" | "inherit";
  className?: string;
};

export function StatusGlyph({
  status,
  unconfirmed = false,
  size = 12,
  color = "status",
  className,
}: StatusGlyphProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      width={size}
      height={size}
      className={clsx("shrink-0", color === "status" && COLOR[status], className)}
    >
      <Shape status={status} unconfirmed={unconfirmed} />
    </svg>
  );
}
