import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DateStamp } from "./date-stamp";
import type { Audience, ProvenanceKind } from "./provenance";
import { ProvenanceMark } from "./provenance-mark";

const KINDS: ProvenanceKind[] = ["confirmed", "declared", "estimated", "planned", "committed"];

function captionOf(kind: ProvenanceKind, audience: Audience) {
  const { container, unmount } = render(
    <DateStamp
      kind={kind}
      audience={audience}
      day="Fri 16 Oct"
      precision="day"
      dateTime="2026-10-16"
      layout="stacked"
    />,
  );
  const caption = container.textContent?.replace("Fri 16 Oct", "") ?? "";
  unmount();
  return caption;
}

describe("DateStamp", () => {
  test("labels each provenance kind differently for operations", () => {
    const captions = KINDS.map((kind) => captionOf(kind, "ops"));

    expect(captions).toEqual([
      "Confirmed",
      "Operator estimate",
      "Estela estimate",
      "Planned",
      "Committed",
    ]);
    expect(new Set(captions).size).toBe(KINDS.length);
  });

  test("tells a customer who stands behind each kind of estimate", () => {
    const captions = KINDS.map((kind) => captionOf(kind, "customer"));

    expect(captions).toEqual([
      "Confirmed",
      "Estimated · by the carrier",
      "Estimated · by Ibón logistics",
      "Planned",
      "Committed",
    ]);
    expect(new Set(captions).size).toBe(KINDS.length);
  });

  test("draws a different glyph for each provenance kind", () => {
    const shapes = KINDS.map((kind) => {
      const { container, unmount } = render(
        <DateStamp kind={kind} day="Fri 16 Oct" precision="day" dateTime="2026-10-16" />,
      );
      const shape = container.querySelector("svg")?.innerHTML;
      unmount();
      return shape;
    });

    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(KINDS.length);
  });

  test("never shows a time of day for a day-precision value, even when one is passed", () => {
    render(
      <DateStamp
        kind="confirmed"
        day="Wed 23 Sep"
        time="08:30"
        precision="day"
        dateTime="2026-09-23"
      />,
    );

    expect(screen.getByText("Wed 23 Sep")).toBeInTheDocument();
    expect(screen.queryByText(/08:30/)).not.toBeInTheDocument();
  });

  test("shows the time of day for a minute-precision value", () => {
    render(
      <DateStamp
        kind="confirmed"
        day="Fri 25 Sep"
        time="21:40"
        precision="minute"
        dateTime="2026-09-25T21:40+02:00"
        place="Valencia"
      />,
    );

    const time = screen.getByText("21:40").closest("time");
    expect(time).toHaveTextContent("Fri 25 Sep 21:40");
    expect(time).toHaveAttribute("datetime", "2026-09-25T21:40+02:00");
    expect(screen.getByText("Valencia")).toBeInTheDocument();
  });

  test("keeps the provenance readable when its words are visually hidden", () => {
    const { container } = render(
      <DateStamp
        kind="estimated"
        day="Fri 9 Oct"
        precision="day"
        dateTime="2026-10-09"
        words="hidden"
      />,
    );

    expect(container).toHaveTextContent("Estela estimate: Fri 9 Oct");
  });

  test("keeps who stands behind an estimate readable when only the label is shown", () => {
    render(
      <DateStamp
        kind="estimated"
        audience="customer"
        day="Fri 16 Oct"
        precision="day"
        dateTime="2026-10-16"
        words="label"
      />,
    );

    expect(screen.getByText("Estimated")).toBeInTheDocument();
    expect(screen.getByText("by Ibón logistics")).toHaveClass("sr-only");
  });

  test("strikes a superseded estimate through instead of hiding it, and says so in words", () => {
    render(
      <DateStamp
        kind="declared"
        day="Wed 14 Oct"
        precision="day"
        dateTime="2026-10-14"
        detail="declared Tue 6 Oct, before the vessel delay"
        superseded
      />,
    );

    expect(screen.getByText("Wed 14 Oct").closest("s")).toHaveTextContent(
      "Wed 14 Oct (superseded)",
    );
    expect(
      screen.getByText(/Operator estimate · declared Tue 6 Oct, before the vessel delay/),
    ).toBeInTheDocument();
  });
});

describe("ProvenanceMark", () => {
  test("says its class to assistive technology when it stands beside free text", () => {
    render(<ProvenanceMark kind="estimated" />);

    expect(screen.getByText("Estela estimate:")).toHaveClass("sr-only");
  });

  test("stays silent where the label is printed next to it", () => {
    const { container } = render(<ProvenanceMark kind="estimated" words="none" />);

    expect(container.textContent).toBe("");
  });
});
