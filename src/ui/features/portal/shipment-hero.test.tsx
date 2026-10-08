import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { ShipmentHero } from "./shipment-hero";

// The hero is rendered from what the gateway really answers Mariana at the start of the demo.
async function renderHero(id: string) {
  const { estela, mariana } = await startEstela();
  const shipment = await estela.portal.shipment(mariana, id);
  if (!shipment) {
    throw new Error(`Mariana cannot see ${id}.`);
  }
  const { container } = render(<ShipmentHero shipment={shipment} now={estela.now()} />);
  const stamps = [...container.querySelectorAll("[data-provenance]")];
  return { shipment, stamps: stamps.map((stamp) => stamp.getAttribute("data-provenance")) };
}

describe("ShipmentHero", () => {
  test("makes no claim for a shipment in progress and prints the review line instead of a date", async () => {
    const { shipment, stamps } = await renderHero("EST-4012");
    expect(shipment.verdict).toBe("in_progress");

    expect(screen.queryByText("On time")).not.toBeInTheDocument();
    expect(screen.getByText("At the port of arrival")).toBeInTheDocument();
    expect(screen.getByText("Delivery date under review (was Wed 7 Oct)")).toBeInTheDocument();
    // The one date left is the committed one: nothing stands in for the delivery date.
    expect(stamps).toEqual(["committed"]);
  });

  test("shows a published date with who stands behind it", async () => {
    const { stamps } = await renderHero("EST-4058");

    expect(screen.getByText("On time")).toBeInTheDocument();
    expect(screen.getByText("Wed 14 Oct")).toBeInTheDocument();
    expect(screen.getByText("Estimated by the carrier")).toBeInTheDocument();
    expect(stamps).toEqual(["declared", "committed"]);
  });
});
