import { clsx } from "clsx";
import type { ReactNode } from "react";
import { StatusGlyph, type StatusKind } from "./status-glyph";

const TONE: Record<StatusKind, string> = {
  on_time: "border-ontime-200 bg-surface text-ontime-700",
  delivered: "border-delivered-200 bg-surface text-delivered-700",
  at_risk: "border-atrisk-200 bg-atrisk-50 text-atrisk-700",
  delayed: "border-delayed-200 bg-delayed-50 text-delayed-700",
  held: "border-held-700 bg-held-700 text-white",
  stale: "border-stale-200 bg-stale-50 bg-hatch text-stale-700",
  neutral: "border-line bg-surface text-ink-700",
};

// Filled means it happened. A hold that rests on an unconfirmed reading keeps the outline
// and loses the fill until a person confirms it.
const HELD_UNCONFIRMED = "border-held-700 bg-surface text-held-700";

const SIZE = {
  sm: "h-5 gap-1 px-2 text-xs",
  md: "h-6 gap-1.5 px-2.5 text-sm",
} as const;

// The chip is shorter than the 28px minimum target, so its hit area extends above and below.
const HIT_AREA = {
  sm: "after:-inset-y-1",
  md: "after:-inset-y-0.5",
} as const;

type StatusPillProps = {
  status: StatusKind;
  /** The status in words. The pill is never read by colour alone. */
  children: ReactNode;
  /** A short measure or condition after the label: "+1 d", "27 h", "unconfirmed". */
  qualifier?: ReactNode;
  /**
   * The status rests on a model reading that nobody has confirmed. Only a hold can: the
   * pill is then drawn hollow. Say so in the qualifier as well.
   */
  unconfirmed?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
  /** With `onPressedChange`, the pill is a filter chip. */
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
};

export function StatusPill({
  status,
  children,
  qualifier,
  unconfirmed = false,
  size = "sm",
  className,
  pressed = false,
  onPressedChange,
}: StatusPillProps) {
  const hollowHold = status === "held" && unconfirmed;
  const classes = clsx(
    // Top-aligned so that a 20px pill fits a 20px line instead of pushing it open.
    "inline-flex shrink-0 items-center rounded-full border align-top font-medium whitespace-nowrap",
    SIZE[size],
    hollowHold ? HELD_UNCONFIRMED : TONE[status],
    className,
  );
  // The spaces are for readers of the text; the flex gap is what separates the parts on screen.
  const content = (
    <>
      <StatusGlyph
        status={status}
        unconfirmed={unconfirmed}
        color={status === "held" ? "inherit" : "status"}
      />
      <span>{children}</span>
      {qualifier != null && (
        <>
          {" "}
          <span aria-hidden="true">·</span>{" "}
          <span className="font-normal tabular-nums">{qualifier}</span>
        </>
      )}
    </>
  );

  if (onPressedChange === undefined) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={clsx(
        classes,
        "relative cursor-pointer transition-shadow after:absolute after:inset-x-0",
        "hover:inset-ring hover:inset-ring-current aria-pressed:inset-ring-2 aria-pressed:inset-ring-current",
        HIT_AREA[size],
      )}
    >
      {content}
    </button>
  );
}
