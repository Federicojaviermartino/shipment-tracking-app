import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { Button } from "./button";

const REASON = "Needs the Logistics role. Ask Marta Soler.";

beforeAll(() => {
  // jsdom has no layout, so the observer that positions the tooltip has nothing to do.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("Button", () => {
  test("acts when it is pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Review notice</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Review notice" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  test("stays focusable when unavailable, does not act, and gives its reason on focus", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabledReason={REASON}>
        Send invoice
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Send invoice" });

    await userEvent.tab();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(REASON);

    await userEvent.click(button);
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
  });

  test("is described by its reason whether or not the tooltip is showing, and only once", async () => {
    render(<Button disabledReason={REASON}>Send invoice</Button>);
    const button = screen.getByRole("button", { name: "Send invoice" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).toHaveAccessibleDescription(REASON);

    await userEvent.tab();
    await screen.findByRole("tooltip");
    expect(button).toHaveAccessibleDescription(REASON);
  });

  test("keeps the reason in view when the unavailable button is pressed", async () => {
    render(<Button disabledReason={REASON}>Send invoice</Button>);
    const button = screen.getByRole("button", { name: "Send invoice" });

    await userEvent.tab();
    await screen.findByRole("tooltip");
    await userEvent.click(button);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  test("does not submit a form while it is unavailable", async () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabledReason="Fix the date that is not in the shipment record.">
          Approve and send
        </Button>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Approve and send" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("keeps its name and ignores presses while its action is running", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Approve and send
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Approve and send" });

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });
});
