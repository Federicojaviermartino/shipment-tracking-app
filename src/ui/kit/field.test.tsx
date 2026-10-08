import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Field, TextArea } from "./field";

const ERROR = "This date is not in the shipment record: 18 Oct";

function Message({ error }: { error?: string }) {
  return (
    <Field label="Message" error={error}>
      <TextArea defaultValue="We estimate delivery in Querétaro on Sun 18 Oct." />
    </Field>
  );
}

describe("Field", () => {
  test("names its control and leaves it valid while there is nothing to say", () => {
    render(<Message />);

    const control = screen.getByRole("textbox", { name: "Message" });
    expect(control).toBeValid();
    expect(control).not.toHaveAccessibleDescription();
  });

  test("announces an error that appears while the user is typing, and ties it to the control", () => {
    const { container, rerender } = render(<Message />);
    // The region has to be there before the message: only a change inside it is read out.
    const live = container.querySelector("[aria-live='polite']");
    expect(live).toBeEmptyDOMElement();

    rerender(<Message error={ERROR} />);

    expect(container.querySelector("[aria-live='polite']")).toBe(live);
    expect(live).toHaveTextContent(ERROR);
    const control = screen.getByRole("textbox", { name: "Message" });
    expect(control).toBeInvalid();
    expect(control).toHaveAccessibleDescription(ERROR);
  });
});
