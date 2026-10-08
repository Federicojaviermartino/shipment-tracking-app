"use client";

import { clsx } from "clsx";
import { Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { overlaySurface } from "./overlay-surface";

const ITEM =
  "flex cursor-default items-start gap-2 rounded-sm px-2 py-1.5 text-sm -outline-offset-2 data-highlighted:bg-sunken";

export const Menu = DropdownMenu.Root;

/** Wrap the control that opens the menu: `<MenuTrigger asChild><Button>…</Button></MenuTrigger>`. */
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        {...props}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={clsx(
          overlaySurface,
          "max-h-(--radix-dropdown-menu-content-available-height) min-w-56 overflow-y-auto p-1",
          className,
        )}
      />
    </DropdownMenu.Portal>
  );
}

type MenuGroupProps = Omit<ComponentProps<typeof DropdownMenu.Group>, "aria-labelledby"> & {
  /** Printed above the items, and the name of the group for assistive technology. */
  label: string;
};

/** A labelled set of items. The label names the group, which a bare label would not. */
export function MenuGroup({ label, children, ...props }: MenuGroupProps) {
  const labelId = useId();

  return (
    <DropdownMenu.Group {...props} aria-labelledby={labelId}>
      <DropdownMenu.Label id={labelId} className="px-2 pt-2 pb-1 text-label">
        {label}
      </DropdownMenu.Label>
      {children}
    </DropdownMenu.Group>
  );
}

export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator {...props} className={clsx("my-1 h-px bg-line", className)} />;
}

type ItemText = {
  /** A second line under the label: a perimeter, a state, the reason an item is unavailable. */
  description?: ReactNode;
  /** Right-aligned, for a state such as "Sent". */
  trailing?: ReactNode;
  children: ReactNode;
};

function ItemBody({ description, trailing, children }: ItemText) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {description && <span className="block text-xs text-ink-600">{description}</span>}
      </span>
      {trailing && <span className="shrink-0 text-xs text-ink-600">{trailing}</span>}
    </>
  );
}

type MenuItemProps = Omit<ComponentProps<typeof DropdownMenu.Item>, "disabled"> &
  ItemText & {
    /**
     * Makes the item unavailable and prints why under its label. The item stays reachable
     * with the keyboard so that the reason can be read.
     */
    disabledReason?: string;
  };

export function MenuItem({
  description,
  trailing,
  disabledReason,
  className,
  children,
  onSelect,
  ...props
}: MenuItemProps) {
  const unavailable = disabledReason !== undefined;
  return (
    <DropdownMenu.Item
      {...props}
      aria-disabled={unavailable || undefined}
      onSelect={unavailable ? (event) => event.preventDefault() : onSelect}
      className={clsx(ITEM, unavailable && "text-ink-500", className)}
    >
      <ItemBody description={disabledReason ?? description} trailing={trailing}>
        {children}
      </ItemBody>
    </DropdownMenu.Item>
  );
}

type MenuRadioItemProps = ComponentProps<typeof DropdownMenu.RadioItem> & ItemText;

export function MenuRadioItem({
  description,
  trailing,
  className,
  children,
  ...props
}: MenuRadioItemProps) {
  return (
    <DropdownMenu.RadioItem {...props} className={clsx(ITEM, className)}>
      <span className="grid h-5 w-4 shrink-0 place-items-center">
        <DropdownMenu.ItemIndicator>
          <Check aria-hidden="true" className="size-4" />
        </DropdownMenu.ItemIndicator>
      </span>
      <ItemBody description={description} trailing={trailing}>
        {children}
      </ItemBody>
    </DropdownMenu.RadioItem>
  );
}
