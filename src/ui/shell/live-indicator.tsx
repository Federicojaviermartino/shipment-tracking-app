import { clsx } from "clsx";

type LiveIndicatorProps = {
  /** Age of the newest operator update, already formatted: "2 min ago". */
  lastUpdate: string;
  className?: string;
};

/** Says that the view follows the operator feed, and how fresh it is. It does not animate. */
export function LiveIndicator({ lastUpdate, className }: LiveIndicatorProps) {
  return (
    <p
      className={clsx("flex items-center gap-2 text-xs whitespace-nowrap text-ink-600", className)}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-600" />
      <span>
        <span className="font-medium text-ink-900">Live</span> ·{" "}
        <span className="max-xl:sr-only">last operator update </span>
        {lastUpdate}
      </span>
    </p>
  );
}
