"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { Toast } from "radix-ui";
import { createContext, type ReactNode, use, useCallback, useMemo, useRef, useState } from "react";
import { AlertGlyph } from "./alert-glyph";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { StatusBar } from "./status-bar";
import { StatusGlyph, type StatusKind } from "./status-glyph";

const VISIBLE_AT_ONCE = 3;
const DISMISS_AFTER_MS = 8000;

export type ToastInput = {
  title: string;
  description?: string;
  /**
   * The status of the shipment the toast is about: the colour of its bar, the glyph before
   * the title and, for assistive technology, the word. Leave it out for a toast that is
   * not about punctuality, such as a completed action.
   */
  status?: { kind: StatusKind; label: string };
  /** Something failed: announced at once and kept until dismissed. */
  error?: boolean;
  action?: { label: string; onSelect: () => void };
};

type ToastRecord = ToastInput & { id: string };

type ToastApi = {
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

type ToastQueue = {
  toasts: readonly ToastRecord[];
  dismiss: (id: string) => void;
};

const ToastApiContext = createContext<ToastApi | null>(null);
const ToastQueueContext = createContext<ToastQueue | null>(null);

export function useToast(): ToastApi {
  const api = use(ToastApiContext);
  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return api;
}

const SURFACE =
  "relative flex w-90 max-w-full items-start gap-3 overflow-hidden rounded-lg border bg-surface py-3 pr-2 pl-4 shadow-overlay";

function surface(error: boolean | undefined) {
  return clsx(SURFACE, error ? "border-ink-900" : "border-line");
}

type ToastLayoutProps = Pick<ToastInput, "status" | "error"> & {
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
  close: ReactNode;
};

// The inside of a toast, shared by the live one and by the specimen. A status never rests
// on the colour of the bar alone, and a failure has a mark of its own: an ink edge and the
// alert glyph instead of a status bar.
function ToastLayout({ status, error, title, description, action, close }: ToastLayoutProps) {
  const mark = error ? <AlertGlyph /> : status ? <StatusGlyph status={status.kind} /> : null;

  return (
    <>
      {!error && <StatusBar status={status?.kind ?? "neutral"} />}
      <div className="flex min-w-0 flex-1 gap-2 py-0.5">
        {mark && <span className="flex h-5 shrink-0 items-center">{mark}</span>}
        <div className="min-w-0 flex-1">
          {title}
          {description}
          {action}
        </div>
      </div>
      {close}
    </>
  );
}

function statusWords({ status, error }: Pick<ToastInput, "status" | "error">) {
  const word = error ? "Error" : status?.label;
  return word && <span className="sr-only">{word}: </span>;
}

const TITLE = "text-sm font-medium";
const DESCRIPTION = "mt-0.5 text-sm text-ink-600";

type LiveToastProps = {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
};

function LiveToast({ toast, onDismiss }: LiveToastProps) {
  const { id, title, description, status, error, action } = toast;

  return (
    <Toast.Root
      // A failure interrupts and waits for the user; anything else is read out when the
      // screen reader is free, and leaves after eight seconds.
      type={error ? "foreground" : "background"}
      duration={error ? Infinity : undefined}
      onOpenChange={(open) => {
        if (!open) {
          onDismiss(id);
        }
      }}
      // An open drawer switches pointer events off outside itself; a toast stays usable.
      style={{ pointerEvents: "auto" }}
      className={clsx(
        surface(error),
        "animate-enter [--enter-from:-8px] data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
      )}
    >
      <ToastLayout
        status={status}
        error={error}
        title={
          <Toast.Title className={TITLE}>
            {statusWords({ status, error })}
            {title}
          </Toast.Title>
        }
        description={
          description && (
            <Toast.Description className={DESCRIPTION}>{description}</Toast.Description>
          )
        }
        action={
          action && (
            <Toast.Action asChild altText={action.label}>
              <Button size="sm" className="mt-2" onClick={action.onSelect}>
                {action.label}
              </Button>
            </Toast.Action>
          )
        }
        close={
          <Toast.Close asChild>
            <IconButton label="Dismiss" icon={<X />} />
          </Toast.Close>
        }
      />
    </Toast.Root>
  );
}

/** Owns the queue and gives `useToast` to everything inside it. It renders nothing itself. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const queue = useMemo(() => ({ toasts, dismiss }), [toasts, dismiss]);

  return (
    <Toast.Provider label="Notification" duration={DISMISS_AFTER_MS}>
      <ToastApiContext value={api}>
        <ToastQueueContext value={queue}>{children}</ToastQueueContext>
      </ToastApiContext>
    </Toast.Provider>
  );
}

/**
 * The stack, top right under the top bar: at most three toasts at a time, the rest wait for
 * a free place. It is a labelled region that F8 jumps to; the timers pause while the pointer
 * or the focus is on it, and a toast that closes under the focus hands it back to the
 * region. Place it once, after the page content and before the demo bar, which stays last
 * in tab order.
 */
export function ToastViewport() {
  const queue = use(ToastQueueContext);
  if (!queue) {
    throw new Error("ToastViewport must be used inside <ToastProvider>.");
  }
  const { toasts, dismiss } = queue;

  return (
    <>
      {toasts.slice(0, VISIBLE_AT_ONCE).map((toast) => (
        <LiveToast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
      <Toast.Viewport className="fixed top-[calc(var(--spacing-topbar)+1rem)] right-4 z-70 flex flex-col gap-2 beside-drawer:right-[calc(var(--spacing-drawer)+1rem)]" />
    </>
  );
}

/** The provider and its viewport together, for a layout with nothing to place after them. */
export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastViewport />
    </ToastProvider>
  );
}
