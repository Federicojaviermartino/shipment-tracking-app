type LaneProps = {
  from: string;
  /** The destination, with its country where the row shows one: "Querétaro, MX". */
  to: string;
  className?: string;
};

/**
 * A lane as "from → to". The arrow is drawn, because the bundled Latin subsets of the Plex
 * faces have no U+2192 and a typed arrow would come from whatever font the system has.
 */
export function Lane({ from, to, className }: LaneProps) {
  return (
    <span className={className}>
      {from}{" "}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        width="12"
        height="12"
        className="inline align-[-1px]"
      >
        <path
          d="M1.5 6h9M7.25 2.75 10.5 6 7.25 9.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">to</span> {to}
    </span>
  );
}
