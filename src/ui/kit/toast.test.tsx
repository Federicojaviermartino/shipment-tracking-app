import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastHost, type ToastInput, useToast } from "./toast";

function Trigger({ toast }: { toast: ToastInput }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(toast)}>
      Show: {toast.title}
    </button>
  );
}

function renderHost(...toasts: ToastInput[]) {
  render(
    <ToastHost>
      {toasts.map((toast) => (
        <Trigger key={toast.title} toast={toast} />
      ))}
    </ToastHost>,
  );
  for (const toast of toasts) {
    fireEvent.click(screen.getByRole("button", { name: `Show: ${toast.title}` }));
  }
}

function stack() {
  return within(screen.getByRole("region", { name: "Notifications (F8)" }));
}

function visibleToasts() {
  return stack()
    .queryAllByRole("listitem")
    .map((toast) => toast.textContent);
}

function dismissButtons() {
  return stack().getAllByRole("button", { name: "Dismiss" });
}

const SENT: ToastInput = { title: "Notice sent." };
const FAILED: ToastInput = { title: "The notice was not sent.", error: true };

describe("ToastHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("reads a toast out politely and a failure at once", () => {
    renderHost(SENT, FAILED);

    // The announcement is written into its live region a frame after the region exists.
    act(() => vi.advanceTimersByTime(100));

    const announcements = screen.getAllByRole("status");
    const of = (text: string) => announcements.find((node) => node.textContent?.includes(text));
    expect(of("Notice sent.")).toHaveAttribute("aria-live", "polite");
    expect(of("Error: The notice was not sent.")).toHaveAttribute("aria-live", "assertive");
  });

  test("says the status of a shipment in words, not only with the colour of its bar", () => {
    renderHost({ title: "NORAY ALTAIR delayed", status: { kind: "at_risk", label: "At risk" } });

    expect(visibleToasts()).toEqual(["At risk: NORAY ALTAIR delayed"]);
  });

  test("removes a toast after eight seconds and keeps a failure until dismissed", () => {
    renderHost(SENT, FAILED);

    act(() => vi.advanceTimersByTime(7999));
    expect(visibleToasts()).toHaveLength(2);

    act(() => vi.advanceTimersByTime(1));
    expect(visibleToasts()).toEqual(["Error: The notice was not sent."]);

    act(() => vi.advanceTimersByTime(60_000));
    expect(visibleToasts()).toHaveLength(1);

    fireEvent.click(dismissButtons()[0] as HTMLElement);
    expect(visibleToasts()).toEqual([]);
  });

  test("shows at most three toasts and lets the next one in when a place frees up", () => {
    renderHost({ title: "One" }, { title: "Two" }, { title: "Three" }, { title: "Four" });

    expect(visibleToasts()).toEqual(["One", "Two", "Three"]);

    fireEvent.click(dismissButtons()[0] as HTMLElement);

    expect(visibleToasts()).toEqual(["Two", "Three", "Four"]);
  });

  test("does not time out while the keyboard focus is on the stack", () => {
    renderHost(SENT);
    const dismiss = dismissButtons()[0] as HTMLElement;

    act(() => dismiss.focus());
    act(() => vi.advanceTimersByTime(60_000));
    expect(visibleToasts()).toEqual(["Notice sent."]);

    act(() => dismiss.blur());
    act(() => vi.advanceTimersByTime(8000));
    expect(visibleToasts()).toEqual([]);
  });

  test("is reached with F8, and keeps the focus when the focused toast is dismissed", () => {
    renderHost(SENT, FAILED);
    const list = stack().getByRole("list");

    fireEvent.keyDown(document, { code: "F8" });
    expect(list).toHaveFocus();

    const dismiss = dismissButtons()[0] as HTMLElement;
    act(() => dismiss.focus());
    fireEvent.click(dismiss);

    expect(visibleToasts()).toEqual(["Error: The notice was not sent."]);
    expect(list).toHaveFocus();
  });

  test("runs the action of a toast and closes it", () => {
    const onSelect = vi.fn();
    renderHost({ title: "NORAY ALTAIR delayed", action: { label: "View", onSelect } });

    fireEvent.click(stack().getByRole("button", { name: "View" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(visibleToasts()).toEqual([]);
  });
});
