import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { startEstela } from "@/composition/test-support";
import { SessionContext } from "@/ui/shell/session";
import { AskedList } from "./asked-list";
import type { FilterField } from "./url-state";

// The button of a step belongs to the message drawer, which has its own tests.
vi.mock("@/ui/features/message-drawer/step-action", () => ({ StepAction: () => null }));

const QUESTION = "urgent shipments to Mexico this week";

async function ask(question: string, dropped: FilterField[] = []) {
  const { estela, marta } = await startEstela();
  const onDrop = vi.fn();
  const onClear = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SessionContext value={{ estela, actor: marta, now: estela.now() }}>
        <AskedList question={question} dropped={dropped} onDrop={onDrop} onClear={onClear} />
      </SessionContext>
    </QueryClientProvider>,
  );
  const chips = await screen.findByRole("list", { name: "Filters" });
  return {
    onDrop,
    onClear,
    chips: () =>
      within(chips)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    shipments: async () =>
      (await screen.findAllByRole("rowheader")).map((cell) => within(cell).getByRole("link")),
  };
}

describe("AskedList", () => {
  test("shows how a question was read as removable chips, and the words it did not use", async () => {
    const { chips, onDrop, shipments } = await ask(QUESTION);

    expect(chips()).toEqual(["Destination: Mexico", "Due: this week, 5–11 Oct"]);
    expect(screen.getByText("Not used: urgent")).toBeInTheDocument();
    expect(screen.getByText("Read by AI as:")).toBeInTheDocument();
    expect((await shipments()).map((link) => link.textContent)).toEqual(["EST-4012", "EST-4036"]);

    await userEvent.click(screen.getByRole("button", { name: "Remove Due: this week, 5–11 Oct" }));

    expect(onDrop).toHaveBeenCalledExactlyOnceWith("due");
  });

  test("filters by what is left of the reading once the reader removed a part of it", async () => {
    const { chips, shipments } = await ask(QUESTION, ["due"]);

    expect(chips()).toEqual(["Destination: Mexico"]);
    expect(await shipments()).toHaveLength(8);
  });

  test("lets go of the question when its last chip is removed", async () => {
    const { onClear, onDrop } = await ask(QUESTION, ["due"]);

    await userEvent.click(screen.getByRole("button", { name: "Remove Destination: Mexico" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onDrop).not.toHaveBeenCalled();
  });
});
