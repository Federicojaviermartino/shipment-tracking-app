import { clsx } from "clsx";
import {
  type Audience,
  provenanceCaption,
  type ProvenanceKind,
  provenanceWords,
} from "./provenance";
import { ProvenanceMark } from "./provenance-mark";

export type DatePrecision = "minute" | "day";

export type DateValue = {
  /** The day, already formatted in the local time of the place: "Fri 16 Oct". */
  day: string;
  /** The time of day, "06:10". Dropped unless the precision is `minute`. */
  time?: string;
  precision: DatePrecision;
  /** Machine-readable value for the `<time>` element. */
  dateTime: string;
};

type DateTextProps = DateValue & {
  /** Newer information has overtaken the value: struck through, and said so in words. */
  superseded?: boolean;
  /** Lays out the day and the time, which are separate elements, inside the `<time>`. */
  className?: string;
};

/**
 * The one place that turns a date into text, so a day-precision value can never show a
 * time of day and a struck date is never read out as a live one.
 */
export function DateText({
  day,
  time,
  precision,
  dateTime,
  superseded = false,
  className,
}: DateTextProps) {
  const text = (
    <time dateTime={dateTime} className={className}>
      <span>{day}</span>
      {precision === "minute" && time && (
        <>
          {" "}
          <span>{time}</span>
        </>
      )}
    </time>
  );

  if (!superseded) {
    return text;
  }
  return (
    <s className="font-normal text-ink-500">
      {text}
      <span className="sr-only"> (superseded)</span>
    </s>
  );
}

// `lift` centres the glyph on the capitals when it sits in a line of text; `gap` is the
// distance from the glyph to the text when the words are stacked under the date.
const SIZE = {
  sm: {
    date: "text-sm font-medium",
    caption: "text-xs text-ink-600",
    glyph: 12,
    lift: "align-[-1px]",
    gap: "gap-x-1.5",
  },
  base: {
    date: "text-base font-medium",
    caption: "text-sm text-ink-600",
    glyph: 12,
    lift: "align-baseline",
    gap: "gap-x-1.5",
  },
  hero: {
    date: "text-4xl font-semibold",
    caption: "text-base text-ink-700",
    glyph: 20,
    lift: "align-[3px]",
    gap: "gap-x-2",
  },
} as const;

type DateStampProps = DateValue & {
  kind: ProvenanceKind;
  /** Chooses the vocabulary: operations read "Operator estimate", a customer "Estimated". */
  audience?: Audience;
  /** The place whose local time this is, shown beside the date. */
  place?: string;
  /** What follows the provenance label: the source, its age, a window. */
  detail?: string;
  /** An estimate that newer information has overtaken: struck through, never hidden. */
  superseded?: boolean;
  mark?: boolean;
  /**
   * `full` shows the label and what follows it; `label` shows the label and keeps the rest
   * for assistive technology; `hidden` keeps all of it for assistive technology only; `none`
   * is for a caller that prints the words itself.
   */
  words?: "full" | "label" | "hidden" | "none";
  /** `inline` flows as one run of text; `stacked` puts the words on a line of their own. */
  layout?: "inline" | "stacked";
  size?: keyof typeof SIZE;
  className?: string;
};

/**
 * Every date in the product goes through this component, so a date never appears without
 * its provenance: a glyph, and the same meaning in words.
 */
export function DateStamp({
  kind,
  audience = "ops",
  day,
  time,
  precision,
  dateTime,
  place,
  detail,
  superseded = false,
  mark = true,
  words = "full",
  layout = "inline",
  size = "sm",
  className,
}: DateStampProps) {
  const { label, by } = provenanceWords(kind, audience);
  const rest = detail ?? by;
  const scale = SIZE[size];
  const stacked = layout === "stacked";
  const glyph = mark && (
    <ProvenanceMark
      kind={kind}
      words="none"
      muted={superseded}
      size={scale.glyph}
      className={stacked ? undefined : clsx("mr-1.5 inline", scale.lift)}
    />
  );

  const date = (
    <span className={clsx("tabular-nums", scale.date)}>
      {words === "hidden" && (
        <span className="sr-only">{provenanceCaption(kind, audience, detail)}: </span>
      )}
      <DateText
        day={day}
        time={time}
        precision={precision}
        dateTime={dateTime}
        superseded={superseded}
      />
      {place && <span className="font-normal text-ink-600"> {place}</span>}
    </span>
  );

  const caption = (words === "full" || words === "label") && (
    <>
      {label}
      {rest && (words === "full" ? ` · ${rest}` : <span className="sr-only"> {rest}</span>)}
    </>
  );

  if (stacked) {
    return (
      <span
        data-provenance={kind}
        className={clsx(
          "inline-grid items-center",
          scale.gap,
          mark && "grid-cols-[auto_minmax(0,1fr)]",
          className,
        )}
      >
        {glyph}
        {date}
        {caption && <span className={clsx(scale.caption, mark && "col-start-2")}>{caption}</span>}
      </span>
    );
  }

  return (
    <span data-provenance={kind} className={className}>
      {glyph}
      {date}
      {caption && (
        <span className={scale.caption}>
          {/* Tied to the date by a no-break space, so a wrapped caption never starts with it. */}
          <span aria-hidden="true">&nbsp;· </span>
          {caption}
        </span>
      )}
    </span>
  );
}
