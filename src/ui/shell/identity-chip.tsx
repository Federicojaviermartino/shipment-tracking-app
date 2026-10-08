import { clsx } from "clsx";

type IdentityChipProps = {
  name: string;
  /** What the person may see, in words: "Logistics · All sites · 23 shipments". */
  perimeter: string;
  className?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** Who is signed in and what they are allowed to see. Not a control: personas change in the demo bar. */
export function IdentityChip({ name, perimeter, className }: IdentityChipProps) {
  return (
    <div className={clsx("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-sm bg-sunken text-2xs font-semibold text-ink-700"
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm/4 font-medium">{name}</p>
        <p className="truncate text-xs text-ink-600">{perimeter}</p>
      </div>
    </div>
  );
}
