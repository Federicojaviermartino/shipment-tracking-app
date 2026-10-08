"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, type RefObject, useRef } from "react";
import { isBesideDrawer } from "./beside-drawer";
import { IconButton } from "./icon-button";

type DrawerPanelProps = {
  title: ReactNode;
  /** One line under the header that says what the drawer is about to do, and to whom. */
  description?: ReactNode;
  close: ReactNode;
  /**
   * What the action will change, pinned above the footer: it stays in view next to the
   * button that causes it, however long the body is.
   */
  summary?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The drawer's surface without its dialog behaviour: a 56px header, a scrolling body and a
 * 64px footer that stays in view. `Drawer` is what screens use; this is exported for places
 * that show the surface at rest.
 */
export function DrawerPanel({
  title,
  description,
  close,
  summary,
  footer,
  children,
}: DrawerPanelProps) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line pr-4 pl-6">
        <div className="min-w-0 truncate text-lg font-semibold">{title}</div>
        {close}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {description && <div className="mb-5 text-sm text-ink-600">{description}</div>}
        {children}
      </div>
      {summary && (
        <div className="shrink-0 border-t border-line bg-canvas px-6 py-3 text-sm">{summary}</div>
      )}
      {footer && (
        <footer className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-line px-6">
          {footer}
        </footer>
      )}
    </div>
  );
}

type DrawerProps = Omit<DrawerPanelProps, "title" | "close"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Where focus goes on closing when the control that opened the drawer is gone, which is
   * the usual outcome of the action taken in it: the case panel or the table, made
   * focusable with `tabIndex={-1}`. Failing that, the page's `<main>`.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
};

/**
 * A modal panel on the right edge, ending above the demo bar. The dialog traps focus,
 * closes on Escape or a click on the scrim, and gives focus back on the way out. Regions
 * marked with `besideDrawer` stay usable while it is open.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  summary,
  footer,
  returnFocusTo,
  children,
}: DrawerProps) {
  // The drawer is opened by state, not by a Radix trigger, so the dialog cannot know where
  // focus came from: remember it on the way in and give it back on the way out.
  const opener = useRef<Element | null>(null);

  function focusOnClose() {
    const from = opener.current;
    const target =
      from instanceof HTMLElement && from.isConnected && from !== document.body
        ? from
        : (returnFocusTo?.current ?? document.querySelector<HTMLElement>("main"));
    target?.focus();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-x-0 top-0 bottom-demobar z-40 animate-scrim bg-ink-900/32" />
        <Dialog.Content
          data-drawer=""
          onOpenAutoFocus={() => {
            opener.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusOnClose();
          }}
          onPointerDownOutside={(event) => {
            if (isBesideDrawer(event.target)) {
              event.preventDefault();
            }
          }}
          className="fixed top-0 right-0 bottom-demobar z-50 w-drawer max-w-full animate-drawer border-l border-line shadow-drawer"
        >
          <DrawerPanel
            title={<Dialog.Title>{title}</Dialog.Title>}
            description={
              description && (
                <Dialog.Description asChild>
                  <div>{description}</div>
                </Dialog.Description>
              )
            }
            close={
              <Dialog.Close asChild>
                <IconButton label="Close" icon={<X />} size="md" />
              </Dialog.Close>
            }
            summary={summary}
            footer={footer}
          >
            {children}
          </DrawerPanel>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
