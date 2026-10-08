import { clsx } from "clsx";
import { Ship, Truck } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PositionMarker } from "./position-marker";
import { StatusGlyph, type StatusKind } from "./status-glyph";

export type RouteProblem = {
  status: StatusKind;
  /** The status in words, for readers who cannot see the glyph: "Held", "At risk". */
  label: string;
  /** It rests on a model reading that nobody has confirmed: a hold is then drawn hollow. */
  unconfirmed?: boolean;
};

export type RouteStop = {
  name: string;
  /** Full strip only: what the place is, "Plant" or "Port · import customs". */
  caption?: string;
  /** A port with a customs gate is drawn as a bar across the line. */
  gate?: boolean;
  /** A problem at this place, such as a customs hold. Never an internal one for a customer. */
  problem?: RouteProblem;
};

export type RouteLeg = {
  mode: "road" | "sea";
  /** Full strip only. */
  operator?: string;
  /** A problem on this stretch, such as a predicted delay or a lost signal. */
  problem?: RouteProblem;
};

/** Where the cargo is: waiting at a stop or under way on a leg. `null` once delivered. */
export type RoutePosition = { on: "stop"; index: number } | { on: "leg"; index: number } | null;

type Journey = {
  /** One more stop than legs: origin, every port, destination. */
  stops: readonly RouteStop[];
  legs: readonly RouteLeg[];
  position: RoutePosition;
  /** The position is the last one known, not the current one: the marker turns hollow. */
  stale?: boolean;
};

type RouteStripProps = Journey & {
  className?: string;
} & (
    | {
        /** 160×16, for rows and cards. It is one image, named in words by the strip itself. */
        variant: "mini";
        /** The text right beside the strip already says the route, the position and any problem. */
        decorative?: boolean;
      }
    | {
        /** 88px high, with place names, modes and operators as a list that can be read. */
        variant: "full";
        decorative?: undefined;
      }
  );

const MODE = {
  road: { label: "Road", underWay: "on the road" },
  sea: { label: "Sea", underWay: "at sea" },
} as const;

function listOf(words: readonly string[]) {
  const last = words[words.length - 1];
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${last}` : (last ?? "");
}

function between(stops: readonly RouteStop[], leg: number) {
  return `between ${stops[leg]?.name} and ${stops[leg + 1]?.name}`;
}

// The strip in words, from the same props it is drawn from: the route, where the cargo is,
// and what is wrong.
function describe({ stops, legs, position, stale }: Journey) {
  const sentences = [
    `${stops[0]?.name} to ${stops[stops.length - 1]?.name} by ${listOf(legs.map((leg) => leg.mode))}`,
  ];

  if (position === null) {
    sentences.push("Delivered");
  } else {
    const leg = position.on === "leg" ? legs[position.index] : undefined;
    const where = leg
      ? `${MODE[leg.mode].underWay} ${between(stops, position.index)}`
      : `at ${stops[position.index]?.name}`;
    sentences.push(
      stale ? `Last known position: ${where}` : where.charAt(0).toUpperCase() + where.slice(1),
    );
  }

  for (const stop of stops) {
    if (stop.problem) {
      sentences.push(`${stop.problem.label} at ${stop.name}`);
    }
  }
  legs.forEach((leg, index) => {
    if (leg.problem) {
      sentences.push(`${leg.problem.label} ${between(stops, index)}`);
    }
  });

  return `${sentences.join(". ")}.`;
}

const MARKER = 12;
const HALO = 2;
const GLYPH = 12;
const GAP = 2;
/** From the centre of a stop or of the marker to the centre of a glyph placed beside it. */
const BESIDE = MARKER / 2 + HALO + GAP + GLYPH / 2;

// The ends of the route are circles and a customs gate is a bar across the line, so that
// on a strip a square can only be the glyph of a hold.
const NODE = {
  mini: { reached: 6, ahead: 4, gateReached: [2, 10], gateAhead: [1, 8] },
  full: { reached: 8, ahead: 6, gateReached: [2, 12], gateAhead: [1, 10] },
} as const;

type Segment = {
  from: number;
  to: number;
  done: boolean;
  /** Pixels left free at each end for a glyph that sits on the line. */
  insetStart: number;
  insetEnd: number;
};

function ProblemGlyph({ problem }: { problem: RouteProblem }) {
  return <StatusGlyph status={problem.status} unconfirmed={problem.unconfirmed} />;
}

/**
 * The journey as a line. Legs have equal width, because proportional widths would erase the
 * road legs next to a sea leg; what was travelled is solid ink and what lies ahead is the
 * hairline of the plan. Road and sea differ by icon and label in the full strip, never by
 * colour.
 */
export function RouteStrip({
  variant,
  stops,
  legs,
  position,
  stale = false,
  decorative = false,
  className,
}: RouteStripProps) {
  const count = legs.length;
  const at = position === null ? count : position.index + (position.on === "leg" ? 0.5 : 0);
  const percent = (units: number) => `${(units / count) * 100}%`;
  const centred = (units: number, width: number, height = width, shift = 0): CSSProperties => ({
    left: `calc(${percent(units)} + ${shift - width / 2}px)`,
    top: `calc(50% - ${height / 2}px)`,
    width,
    height,
  });

  // The line stops short of a glyph instead of running behind it.
  const segments: Segment[] = legs.flatMap((leg, index) => {
    const mid = index + 0.5;
    const end = index + 1;
    const markerHere = at === mid;
    const clearOfStop = BESIDE + GLYPH / 2 + GAP;
    const clearOfLegGlyph = GLYPH / 2 + GAP;
    return [
      {
        from: index,
        to: mid,
        done: at >= mid,
        insetStart: stops[index]?.problem ? clearOfStop : 0,
        insetEnd: leg.problem && !markerHere ? clearOfLegGlyph : 0,
      },
      {
        from: mid,
        to: end,
        done: at >= end,
        insetStart: leg.problem ? (markerHere ? clearOfStop : clearOfLegGlyph) : 0,
        insetEnd: end === count && stops[end]?.problem ? clearOfStop : 0,
      },
    ];
  });

  const sizes = NODE[variant];

  const track = (
    <div aria-hidden="true" className="relative h-4">
      {segments.map(({ from, to, done, insetStart, insetEnd }) => (
        <span
          key={from}
          className={clsx(
            "absolute",
            done ? "top-[7px] h-0.5 bg-ink-900" : "top-2 h-px bg-ink-500",
          )}
          style={{
            left: `calc(${percent(from)} + ${insetStart}px)`,
            width: `max(0px, calc(${percent(to - from)} - ${insetStart + insetEnd}px))`,
          }}
        />
      ))}
      {stops.map((stop, index) => {
        const reached = index <= at;
        const tone = reached ? "bg-ink-900" : "bg-ink-500";
        if (stop.gate) {
          const [width, height] = reached ? sizes.gateReached : sizes.gateAhead;
          return (
            <span
              key={index}
              className={clsx("absolute", tone)}
              style={centred(index, width, height)}
            />
          );
        }
        return (
          <span
            key={index}
            className={clsx("absolute rounded-full", tone)}
            style={centred(index, reached ? sizes.reached : sizes.ahead)}
          />
        );
      })}
      {legs.map(
        (leg, index) =>
          leg.problem && (
            <span
              key={index}
              className="absolute grid place-items-center"
              style={centred(index + 0.5, GLYPH, GLYPH, at === index + 0.5 ? BESIDE : 0)}
            >
              <ProblemGlyph problem={leg.problem} />
            </span>
          ),
      )}
      {stops.map(
        (stop, index) =>
          stop.problem && (
            <span
              key={index}
              className="absolute grid place-items-center"
              style={centred(index, GLYPH, GLYPH, index === count ? -BESIDE : BESIDE)}
            >
              <ProblemGlyph problem={stop.problem} />
            </span>
          ),
      )}
      {position !== null && (
        <PositionMarker stale={stale} className="absolute" style={centred(at, MARKER)} />
      )}
    </div>
  );

  if (variant === "mini") {
    // The left padding is half an end node, so that the route starts on the text edge of
    // whatever is set above or below the strip.
    return (
      <div
        {...(decorative
          ? { "aria-hidden": true }
          : { role: "img", "aria-label": describe({ stops, legs, position, stale }) })}
        className={clsx("w-40 shrink-0 pr-2 pl-[3px]", className)}
      >
        {track}
      </div>
    );
  }

  // What a reader of the list cannot see on the line, said after the item it belongs to.
  const aside = (current: boolean, problem?: RouteProblem, delivered = false) => {
    const words = [
      problem?.label,
      current && stale ? "last known position" : undefined,
      delivered ? "delivered" : undefined,
    ].filter(Boolean);
    return words.length > 0 && <span className="sr-only">: {words.join(", ")}</span>;
  };

  const items: ReactNode[] = [];
  stops.forEach((stop, index) => {
    const first = index === 0;
    const last = index === count;
    const here = position?.on === "stop" && position.index === index;
    items.push(
      <li
        key={`stop-${index}`}
        aria-current={here ? "step" : undefined}
        className={clsx(
          "absolute top-13 min-w-0",
          first ? "-left-1 text-left" : last ? "-right-1 text-right" : "text-center",
        )}
        style={
          first || last
            ? { width: `calc(${percent(0.5)} + 0.25rem)` }
            : { left: percent(index - 0.5), width: percent(1) }
        }
      >
        <div className="truncate text-sm font-medium">{stop.name}</div>
        {stop.caption && <div className="truncate text-xs text-ink-500">{stop.caption}</div>}
        {aside(here, stop.problem, last && position === null)}
      </li>,
    );

    const leg = legs[index];
    if (leg) {
      const Icon = leg.mode === "sea" ? Ship : Truck;
      const under = position?.on === "leg" && position.index === index;
      items.push(
        <li
          key={`leg-${index}`}
          aria-current={under ? "step" : undefined}
          className="absolute top-0 flex h-5 items-center justify-center gap-1.5 px-3 text-xs text-ink-600"
          style={{ left: percent(index), width: percent(1) }}
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {MODE[leg.mode].label}
            {leg.operator && ` · ${leg.operator}`}
          </span>
          {aside(under, leg.problem)}
        </li>,
      );
    }
  });

  return (
    <div className={clsx("h-22 px-1", className)}>
      <div className="relative h-full">
        <div className="absolute inset-x-0 top-7">{track}</div>
        <ol aria-label="Route">{items}</ol>
      </div>
    </div>
  );
}
