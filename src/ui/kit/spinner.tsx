import { clsx } from "clsx";

type SpinnerProps = {
  size?: number;
  className?: string;
};

/** Progress of an action the user just started. It takes the colour of the text around it. */
export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={clsx("shrink-0 animate-spin", className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
