import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

const SIZE = {
  sm: "size-7",
  md: "size-8",
} as const;

type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  /** The accessible name: an icon alone says nothing to a screen reader. */
  label: string;
  icon: ReactNode;
  /** 28px, the minimum target, or 32px. */
  size?: keyof typeof SIZE;
};

export function IconButton({
  label,
  icon,
  size = "sm",
  type = "button",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={clsx(
        "grid shrink-0 cursor-pointer place-items-center rounded-sm text-ink-600 transition-colors hover:bg-sunken hover:text-ink-900 active:bg-line [&>svg]:size-4",
        SIZE[size],
        className,
      )}
    >
      {icon}
    </button>
  );
}
