import { clsx } from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg";

// Chrome is colourless: the primary action is ink, never a status or model colour.
const ENABLED: Record<ButtonVariant, string> = {
  primary: "bg-ink-900 text-white hover:bg-ink-700 active:bg-ink-600",
  secondary: "border border-line-strong bg-surface text-ink-900 hover:bg-sunken active:bg-line",
  ghost: "text-ink-700 hover:bg-sunken hover:text-ink-900 active:bg-line",
  link: "text-brand-700 underline-offset-4 hover:underline active:text-brand-600",
};

const DISABLED: Record<ButtonVariant, string> = {
  primary: "cursor-not-allowed bg-sunken text-ink-500",
  secondary: "cursor-not-allowed border border-line bg-surface text-ink-500",
  ghost: "cursor-not-allowed text-ink-500",
  link: "cursor-not-allowed text-ink-500",
};

const SIZE: Record<ButtonSize, { box: string; padding: string }> = {
  sm: { box: "h-7 gap-1.5", padding: "px-2.5" },
  md: { box: "h-8 gap-2", padding: "px-3" },
  lg: { box: "h-10 gap-2", padding: "px-4" },
};

type ButtonStyle = {
  variant?: ButtonVariant;
  /** Heights 28 (row actions), 32 and 40. */
  size?: ButtonSize;
  disabled?: boolean;
};

/**
 * The classes of a button. `Button` uses them; a link that has to look like a button takes
 * them directly, which also works in a Server Component.
 */
export function buttonStyles({
  variant = "secondary",
  size = "md",
  disabled = false,
}: ButtonStyle = {}) {
  return clsx(
    "relative inline-flex shrink-0 items-center justify-center rounded-sm text-sm font-medium whitespace-nowrap transition-colors select-none",
    SIZE[size].box,
    // A link sits flush with the text around it: two padding utilities would fight by source order.
    variant === "link" ? "px-0" : SIZE[size].padding,
    disabled ? DISABLED[variant] : clsx("cursor-pointer", ENABLED[variant]),
  );
}
