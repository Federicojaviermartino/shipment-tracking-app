import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { AskBar } from "./ask-bar";

const SUGGESTIONS = ["shipments to France this week running late", "anything stuck in customs?"];

function Harness({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <AskBar
        value={value}
        onValueChange={setValue}
        onSubmit={onSubmit}
        suggestions={SUGGESTIONS}
      />
      <textarea aria-label="Message" />
    </>
  );
}

describe("AskBar", () => {
  test("takes the focus on “/” from anywhere outside a text field", async () => {
    render(<Harness onSubmit={vi.fn()} />);

    await userEvent.keyboard("/");

    expect(screen.getByRole("combobox", { name: "Ask about your shipments" })).toHaveFocus();
  });

  test("leaves “/” alone while the user is typing in another field", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    const message = screen.getByRole("textbox", { name: "Message" });

    await userEvent.type(message, "TGF-26-03290 / OC 48176");

    expect(message).toHaveFocus();
    expect(message).toHaveValue("TGF-26-03290 / OC 48176");
  });

  test("offers suggested questions on focus and asks the one picked with the keyboard", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByRole("combobox");

    await userEvent.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(SUGGESTIONS.length);

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("anything stuck in customs?");
    expect(input).toHaveValue("anything stuck in customs?");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("asks what was typed, trimmed, and never an empty question", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByRole("combobox");

    await userEvent.type(input, "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(input, "  order 12345  {Enter}");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("order 12345");
  });

  test("closes the suggestions on Escape and keeps the focus", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    const input = screen.getByRole("combobox");

    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });
});
