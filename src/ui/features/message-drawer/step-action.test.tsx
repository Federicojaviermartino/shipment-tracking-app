import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { StepAction } from "./step-action";
import { renderAs, stepOf, stubLayout } from "./test-support";

const HELD = "EST-4012";

beforeAll(stubLayout);

describe("StepAction", () => {
  test("is unavailable, with the reason, for a role that may not take the step", async () => {
    const { estela, lucia } = await startEstela();
    const step = await stepOf(estela, lucia, HELD, "send_document");
    renderAs(estela, lucia, <StepAction shipmentId={HELD} step={step} />);
    const button = screen.getByRole("button", { name: "Send invoice" });

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Needs the Logistics role. Ask Marta Soler.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("confirms a reading in place on the shipment page", async () => {
    const { estela, marta } = await startEstela();
    const step = await stepOf(estela, marta, HELD, "confirm_reading");
    renderAs(estela, marta, <StepAction shipmentId={HELD} step={step} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm reading" }));

    expect(
      await screen.findByText("Reading confirmed. It now counts as a fact."),
    ).toBeInTheDocument();
    const shipment = await estela.ops.shipment(marta, HELD);
    expect(shipment?.case?.reading?.state).toBe("ai_accepted");
  });

  test("leads to the shipment from a table row instead of confirming a reading there", async () => {
    const { estela, marta } = await startEstela();
    const step = await stepOf(estela, marta, HELD, "confirm_reading");
    renderAs(estela, marta, <StepAction shipmentId={HELD} step={step} inRow />);

    expect(screen.getByRole("link", { name: "Confirm reading" })).toHaveAttribute(
      "href",
      "/ops/shipments/EST-4012",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("has no button once the step is done", async () => {
    const { estela, marta } = await startEstela();
    const todo = await stepOf(estela, marta, HELD, "confirm_reading");
    await estela.ops.execute(marta, {
      type: "confirm_reading",
      shipmentId: HELD,
      eventKey: todo.eventKey ?? "",
      accepted: true,
    });
    const done = await stepOf(estela, marta, HELD, "confirm_reading");
    const { container } = renderAs(estela, marta, <StepAction shipmentId={HELD} step={done} />);

    expect(done.state).toBe("done");
    expect(container.querySelector("button, a")).toBeNull();
  });
});
