import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { StepAction } from "./step-action";
import { renderAs, stepOf, stubLayout } from "./test-support";

const DELAYED = "EST-4058";
const VESSEL_DELAY = "A";

beforeAll(stubLayout);

type Options = Parameters<typeof startEstela>[0];

// EST-4058 once its vessel is delayed: a customer notice waits for approval.
async function openNotice(options?: Options) {
  const world = await startEstela(options);
  await world.estela.demo.send(VESSEL_DELAY);
  const step = await stepOf(world.estela, world.marta, DELAYED, "notify_customer");
  renderAs(world.estela, world.marta, <StepAction shipmentId={DELAYED} step={step} />);

  await userEvent.click(screen.getByRole("button", { name: "Review notice" }));
  const drawer = await screen.findByRole("dialog", { name: "Customer notice" });
  return { world, drawer: within(drawer) };
}

describe("MessageDrawer", () => {
  test("starts the review on the subject of the draft", async () => {
    const { drawer } = await openNotice();

    const subject = await drawer.findByRole("textbox", { name: "Subject" });

    expect(subject).toHaveValue("Order 12345: new delivery estimate, Fri 16 Oct");
    expect(subject).toHaveFocus();
    expect(drawer.getByText("AI draft")).toBeInTheDocument();
    expect(drawer.getByText(/^Drafted by AI from \d+ facts\. Nothing is sent/)).toBeInTheDocument();
  });

  test("sends the text as the reader left it, and says so", async () => {
    const { world, drawer } = await openNotice();
    const body = await drawer.findByRole("textbox", { name: "Message" });

    await userEvent.type(body, " We are sorry for the change.");
    expect(drawer.getByText("AI draft · edited")).toBeInTheDocument();
    await userEvent.click(drawer.getByRole("button", { name: "Approve and send" }));

    expect(
      await screen.findByText("Notice sent. Aquabajío Ingeniería now sees Fri 16 Oct."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const shipment = await world.estela.ops.shipment(world.marta, DELAYED);
    expect(shipment?.messages[0]?.body).toMatch(/please move it\. We are sorry for the change\.$/);
  });

  test("names what approving will change for the customer", async () => {
    const { drawer } = await openNotice();

    const changes = await drawer.findByRole("region", {
      name: "What approving changes for the customer",
    });

    expect(changes).toHaveTextContent(/At sea\s*becomes\s*Delayed/);
    expect(changes).toHaveTextContent(
      /Delivery date under review \(was Wed 14 Oct\)\s*becomes\s*Fri 16 Oct\s*Estimated by Ibón logistics, approved by Marta Soler/,
    );
  });

  test("names a date that is not in the record and does not send it", async () => {
    const { world, drawer } = await openNotice();
    const body = await drawer.findByRole("textbox", { name: "Message" });

    await userEvent.type(body, " Expect it on 18 Oct.");

    expect(drawer.getByText("This date is not in the shipment record: 18 Oct")).toBeInTheDocument();
    expect(body).toBeInvalid();
    const approve = drawer.getByRole("button", { name: "Approve and send" });
    expect(approve).toHaveAccessibleDescription("Fix the date that is not in the shipment record.");
    await userEvent.click(approve);
    const shipment = await world.estela.ops.shipment(world.marta, DELAYED);
    expect(shipment?.messages).toHaveLength(0);
  });

  test("leaves the fields empty and unmarked when the assistant fails", async () => {
    const { drawer } = await openNotice({
      ai: { drafter: { draft: () => Promise.reject(new Error("model down")) } },
    });

    expect(
      await drawer.findByText("The assistant couldn't write a draft. Start from the facts below."),
    ).toBeInTheDocument();
    expect(drawer.getByRole("textbox", { name: "Subject" })).toHaveValue("");
    expect(drawer.getByRole("textbox", { name: "Message" })).toHaveValue("");
    expect(drawer.queryByText(/AI draft/)).not.toBeInTheDocument();
    expect(drawer.getByText("Committed date")).toBeInTheDocument();
  });

  test("refuses a draft the record has moved under, and reloads it", async () => {
    const { world, drawer } = await openNotice();
    await drawer.findByRole("textbox", { name: "Subject" });

    await world.estela.demo.send("B");
    await userEvent.click(drawer.getByRole("button", { name: "Approve and send" }));

    expect(
      await drawer.findByText("The estimate changed while this draft was open."),
    ).toBeInTheDocument();
    await userEvent.click(drawer.getByRole("button", { name: "Reload the draft" }));
    await waitFor(() =>
      expect(drawer.getByRole("textbox", { name: "Subject" })).toHaveValue(
        "Order 12345: delivery moved to Fri 16 Oct",
      ),
    );
    expect(drawer.queryByText("The estimate changed while this draft was open.")).toBeNull();
  });
});
