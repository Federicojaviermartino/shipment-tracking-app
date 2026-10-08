import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { StatusKind } from "./status-glyph";
import { StatusPill } from "./status-pill";

const STATUSES: { status: StatusKind; label: string }[] = [
  { status: "on_time", label: "On time" },
  { status: "at_risk", label: "At risk" },
  { status: "delayed", label: "Delayed" },
  { status: "held", label: "Held" },
  { status: "stale", label: "Stale" },
  { status: "delivered", label: "Delivered" },
  { status: "neutral", label: "In progress" },
];

describe("StatusPill", () => {
  test("is identifiable without colour: a glyph of its own and the status in words", () => {
    const shapes = STATUSES.map(({ status, label }) => {
      const { container, unmount } = render(<StatusPill status={status}>{label}</StatusPill>);
      const glyph = container.querySelector("svg");

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(glyph).toHaveAttribute("aria-hidden", "true");

      // Colour comes only from classes on the <svg>; what is inside it is pure geometry.
      const shape = glyph?.innerHTML;
      unmount();
      return shape;
    });

    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(STATUSES.length);
  });

  test("tells at risk from delayed by a hollow and a filled triangle, not by hue", () => {
    const { container: atRisk } = render(<StatusPill status="at_risk">At risk</StatusPill>);
    const { container: delayed } = render(<StatusPill status="delayed">Delayed</StatusPill>);

    const hollow = atRisk.querySelector("svg path");
    const filled = delayed.querySelector("svg path");

    expect(hollow?.getAttribute("d")).toBe(filled?.getAttribute("d"));
    expect(hollow).toHaveAttribute("fill", "none");
    expect(filled).toHaveAttribute("fill", "currentColor");
  });

  test("draws a hold that nobody has confirmed as the hollow twin of a hold", () => {
    const { container: confirmed } = render(<StatusPill status="held">Held</StatusPill>);
    const { container: unconfirmed } = render(
      <StatusPill status="held" qualifier="unconfirmed" unconfirmed>
        Held
      </StatusPill>,
    );

    expect(confirmed.querySelector("svg rect")).toHaveAttribute("fill", "currentColor");
    expect(unconfirmed.querySelector("svg rect")).toHaveAttribute("fill", "none");
    expect(unconfirmed).toHaveTextContent("Held · unconfirmed");
  });

  test("reads its qualifier after the label", () => {
    render(
      <StatusPill status="at_risk" qualifier="+1 d">
        At risk
      </StatusPill>,
    );

    expect(screen.getByText("At risk").parentElement).toHaveTextContent("At risk · +1 d");
  });

  test("is plain text unless it filters", () => {
    render(<StatusPill status="held">Held</StatusPill>);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("is a toggle button when it is a filter chip", async () => {
    const onPressedChange = vi.fn();
    render(
      <StatusPill status="held" pressed={false} onPressedChange={onPressedChange}>
        2 Held
      </StatusPill>,
    );

    const chip = screen.getByRole("button", { name: "2 Held" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(chip);

    expect(onPressedChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});
