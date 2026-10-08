import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, test } from "vitest";
import { besideDrawer } from "./beside-drawer";
import { Drawer } from "./drawer";

type HarnessProps = {
  /** Approving completes the step, which replaces the button that opened the drawer. */
  completesStep?: boolean;
};

function Harness({ completesStep = false }: HarnessProps) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const casePanel = useRef<HTMLElement>(null);

  return (
    <>
      <main>
        <section ref={casePanel} tabIndex={-1} aria-label="Case">
          {done ? (
            <p>Done · Marta Soler</p>
          ) : (
            <button type="button" onClick={() => setOpen(true)}>
              Review notice
            </button>
          )}
        </section>
        <p>Somewhere else on the page</p>
      </main>
      {/* The class that restores pointer events does nothing without a stylesheet. */}
      <section {...besideDrawer} aria-label="Demo controls" style={{ pointerEvents: "auto" }}>
        <button type="button">Send event</button>
      </section>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Customer notice"
        returnFocusTo={casePanel}
        footer={
          <button
            type="button"
            onClick={() => {
              setDone(completesStep);
              setOpen(false);
            }}
          >
            Approve and send
          </button>
        }
      >
        <p>The draft.</p>
      </Drawer>
    </>
  );
}

// A modal dialog switches pointer events off outside itself, which is the point of two of
// these tests: the check that would refuse such a press is off.
const user = userEvent.setup({ pointerEventsCheck: 0 });

async function openDrawer() {
  await user.click(screen.getByRole("button", { name: "Review notice" }));
  return screen.findByRole("dialog", { name: "Customer notice" });
}

describe("Drawer", () => {
  test("gives the focus back to the control that opened it", async () => {
    render(<Harness />);
    await openDrawer();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review notice" })).toHaveFocus(),
    );
  });

  test("moves the focus to the case when the step was completed and its button is gone", async () => {
    render(<Harness completesStep />);
    await openDrawer();

    await user.click(screen.getByRole("button", { name: "Approve and send" }));

    expect(screen.getByText("Done · Marta Soler")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("region", { name: "Case" })).toHaveFocus());
  });

  test("stays open while a region beside it is used, and closes on a press elsewhere", async () => {
    render(<Harness />);
    await openDrawer();

    await user.click(screen.getByText("Send event"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByText("Somewhere else on the page"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
