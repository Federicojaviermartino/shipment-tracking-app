"use client";

import { clsx } from "clsx";
import type { ComponentProps, MouseEvent, PointerEvent, ReactNode } from "react";
import { type ButtonSize, buttonStyles, type ButtonVariant } from "./button-styles";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

type ButtonProps = Omit<ComponentProps<"button">, "disabled"> & {
  variant?: ButtonVariant;
  /** Heights 28 (row actions), 32 and 40. */
  size?: ButtonSize;
  /** A 16px icon before the label. */
  icon?: ReactNode;
  /** The action is running: a spinner takes the icon's place and the width stays. */
  loading?: boolean;
  /**
   * Makes the button unavailable and says why. It is the only way to disable a button: one
   * that cannot be used always tells the user what to do about it. The reason shows as a
   * tooltip on hover and on focus, and describes the button to assistive technology at all
   * times.
   */
  disabledReason?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabledReason,
  type = "button",
  className,
  children,
  onClick,
  onPointerDown,
  ...props
}: ButtonProps) {
  const unavailable = disabledReason !== undefined;
  const inert = unavailable || loading;

  // An unavailable button stays focusable so that keyboard users can reach the reason. It
  // swallows the press; cancelling the event also stops the tooltip from closing on it.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (inert) {
      event.preventDefault();
      return;
    }
    onPointerDown?.(event);
  }

  const button = (
    <button
      {...props}
      type={type}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      className={clsx(buttonStyles({ variant, size, disabled: unavailable }), className)}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
    >
      {icon && (
        <span className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">
          {loading ? <Spinner /> : icon}
        </span>
      )}
      <span className={clsx(loading && !icon && "opacity-0")}>{children}</span>
      {loading && !icon && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );

  return unavailable ? (
    <Tooltip content={disabledReason} describes>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
