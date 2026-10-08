import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { Estela } from "@/application/estela";
import { startEstela } from "@/composition/test-support";
import type { InternalActor } from "@/domain/perimeter";
import { renderAs, stubLayout } from "@/ui/features/message-drawer/test-support";
import { OpsShipmentScreen } from "./ops-shipment-screen";

const scrollIntoView = vi.fn();

beforeAll(() => {
  stubLayout();
  // jsdom does not scroll.
  Element.prototype.scrollIntoView = scrollIntoView;
});

// The screen reads its route parameters with `use`, so the first render suspends.
function open(estela: Estela, actor: InternalActor, id: string) {
  const params = Promise.resolve({ id });
  return act(async () =>
    renderAs(
      estela,
      actor,
      <Suspense>
        <OpsShipmentScreen params={params} />
      </Suspense>,
    ),
  );
}

describe("OpsShipmentScreen", () => {
  test("gives the same answer for an unknown shipment and for one outside the perimeter", async () => {
    const { estela, iker } = await startEstela();

    // A Zaragoza shipment, for someone who works the Abadiño plant only.
    for (const id of ["EST-9999", "EST-4058"]) {
      const { unmount } = await open(estela, iker, id);

      expect(await screen.findByText("We couldn't find that shipment.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to shipments" })).toHaveAttribute(
        "href",
        "/ops",
      );
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      unmount();
    }
  });

  test("sets the three door dates side by side once the vessel is delayed", async () => {
    const { estela, marta } = await startEstela();
    await estela.demo.send("A");
    await open(estela, marta, "EST-4058");

    const delivery = within(await screen.findByRole("region", { name: "Delivery" }));
    const term = (name: string) => delivery.getByText(name).closest("div");

    expect(term("Committed")).toHaveTextContent("Thu 15 Oct");
    expect(term("Operator estimate")).toHaveTextContent(
      "Wed 14 Oct (superseded)Turia Global Forwarding · declared Tue 6 Oct, before the vessel delay",
    );
    expect(term("Estela estimate")).toHaveTextContent(/\+1 d\s*Fri 16 Oct/);
    expect(delivery.getByText("Delivery date under review (was Wed 14 Oct)")).toBeInTheDocument();

    await userEvent.click(delivery.getByRole("button", { name: "Why?" }));

    expect(delivery.getByText("Vessel berths at Veracruz")).toBeInTheDocument();
    expect(delivery.getByText("declared by Noray Lines")).toBeInTheDocument();
    expect(delivery.getByText("Firms up when the vessel berths.")).toBeInTheDocument();
  });

  test("withholds an estimate instead of showing a date nobody stands behind", async () => {
    const { estela, marta } = await startEstela();
    await open(estela, marta, "EST-4127");

    const delivery = within(await screen.findByRole("region", { name: "Delivery" }));

    expect(
      delivery.getByText("No estimate: no position from Eisvogel Spedition for 27 h."),
    ).toBeInTheDocument();
    expect(delivery.queryByRole("button", { name: "Why?" })).not.toBeInTheDocument();
  });

  test("turns a reading into a fact when a person confirms it", async () => {
    const { estela, marta } = await startEstela();
    await open(estela, marta, "EST-4012");
    const panel = within(
      await screen.findByRole("region", { name: /^Held: customs hold, read by AI/ }),
    );

    expect(panel.getByRole("button", { name: "Send invoice" })).toHaveAccessibleDescription(
      "Confirm the AI reading first.",
    );
    await userEvent.click(panel.getByRole("button", { name: "Confirm reading" }));

    const confirmed = within(await screen.findByRole("region", { name: "Held: customs hold" }));
    expect(confirmed.getByText("Read by AI · confirmed by Marta Soler")).toBeInTheDocument();
    expect(confirmed.getByText(/^Done · Marta Soler ·/)).toBeInTheDocument();
    expect(confirmed.getByRole("button", { name: "Send invoice" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  test("leads from a line of evidence to its entry in the timeline", async () => {
    const { estela, marta } = await startEstela();
    await open(estela, marta, "EST-4131");

    await userEvent.click(await screen.findByRole("button", { name: "View in timeline" }));

    const entry = screen.getByText(/^Carrier hold: 1 package damaged/, { selector: "li span" });
    expect(scrollIntoView.mock.instances).toEqual([entry.closest("li")]);
  });
});
