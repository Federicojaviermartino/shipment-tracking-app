import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { TableRow } from "./table-row";

function Rows({ flashKey }: { flashKey?: string }) {
  return (
    <table>
      <tbody>
        <TableRow flashKey={flashKey}>
          <td>EST-4063</td>
        </TableRow>
      </tbody>
    </table>
  );
}

const BAR_UNDER_REDUCED_MOTION = "motion-reduce:*:first:brand-bar";

describe("TableRow", () => {
  test("does not flash for the data it was mounted with", () => {
    render(<Rows flashKey="event-1" />);

    expect(screen.getByRole("row").className).not.toContain("animate-flash");
  });

  test("flashes each time its data changes, without being remounted", () => {
    const { rerender } = render(<Rows flashKey="event-1" />);
    const row = screen.getByRole("row");

    rerender(<Rows flashKey="event-2" />);
    expect(row).toHaveClass("motion-safe:animate-flash");

    // A second change has to restart the animation, which only a different name does.
    rerender(<Rows flashKey="event-3" />);
    expect(row).toHaveClass("motion-safe:animate-flash-again");
    expect(row).not.toHaveClass("motion-safe:animate-flash");
    expect(screen.getByRole("row")).toBe(row);
  });

  test("keeps a bar for readers without motion until the row is hovered, and shows it again on the next change", async () => {
    const { rerender } = render(<Rows flashKey="event-1" />);
    const row = screen.getByRole("row");

    rerender(<Rows flashKey="event-2" />);
    expect(row).toHaveClass(BAR_UNDER_REDUCED_MOTION);

    await userEvent.hover(row);
    expect(row).not.toHaveClass(BAR_UNDER_REDUCED_MOTION);

    rerender(<Rows flashKey="event-3" />);
    expect(row).toHaveClass(BAR_UNDER_REDUCED_MOTION);
  });

  test("shows the bar for a change that arrives while the pointer is already on the row", async () => {
    const { rerender } = render(<Rows flashKey="event-1" />);
    const row = screen.getByRole("row");

    // The usual order in the product: the reader is on the row, then its data changes.
    await userEvent.hover(row);
    rerender(<Rows flashKey="event-2" />);

    expect(row).toHaveClass(BAR_UNDER_REDUCED_MOTION);
  });
});
