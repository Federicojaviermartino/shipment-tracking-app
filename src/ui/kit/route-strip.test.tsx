import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RouteLeg, type RouteStop, RouteStrip } from "./route-strip";

const OCEAN_LEGS: RouteLeg[] = [
  { mode: "road", operator: "Transportes Cierzo" },
  { mode: "sea", operator: "Noray Lines" },
  { mode: "road", operator: "Turia Global Forwarding" },
];

const HELD_AT_VERACRUZ: RouteStop[] = [
  { name: "Abadiño", caption: "Plant" },
  { name: "Valencia", caption: "Port · export customs", gate: true },
  {
    name: "Veracruz",
    caption: "Port · import customs",
    gate: true,
    problem: { status: "held", label: "Held, unconfirmed", unconfirmed: true },
  },
  { name: "Querétaro", caption: "Consignee" },
];

const ROAD_STOPS: RouteStop[] = [{ name: "Zaragoza" }, { name: "Mannheim" }];

describe("RouteStrip", () => {
  test("names the mini strip from what it draws: the route, the position and the problem", () => {
    render(
      <RouteStrip
        variant="mini"
        stops={HELD_AT_VERACRUZ}
        legs={OCEAN_LEGS}
        position={{ on: "stop", index: 2 }}
      />,
    );

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Abadiño to Querétaro by road, sea and road. At Veracruz. Held, unconfirmed at Veracruz.",
    );
  });

  test("says that a stale position is the last one known", () => {
    render(
      <RouteStrip
        variant="mini"
        stops={ROAD_STOPS}
        legs={[{ mode: "road", problem: { status: "stale", label: "No position for 27 h" } }]}
        position={{ on: "leg", index: 0 }}
        stale
      />,
    );

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Zaragoza to Mannheim by road. Last known position: on the road between Zaragoza and Mannheim. No position for 27 h between Zaragoza and Mannheim.",
    );
  });

  test("says that a route with no position left is delivered", () => {
    render(
      <RouteStrip variant="mini" stops={ROAD_STOPS} legs={[{ mode: "road" }]} position={null} />,
    );

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Zaragoza to Mannheim by road. Delivered.",
    );
  });

  test("is silent only when it is told that the text beside it says the same", () => {
    render(
      <RouteStrip
        variant="mini"
        decorative
        stops={ROAD_STOPS}
        legs={[{ mode: "road" }]}
        position={{ on: "stop", index: 0 }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("keeps the names of the full strip readable, as a list with the current step marked", () => {
    render(
      <RouteStrip
        variant="full"
        stops={HELD_AT_VERACRUZ}
        legs={OCEAN_LEGS}
        position={{ on: "stop", index: 2 }}
      />,
    );

    const items = within(screen.getByRole("list", { name: "Route" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "AbadiñoPlant",
      "Road · Transportes Cierzo",
      "ValenciaPort · export customs",
      "Sea · Noray Lines",
      "VeracruzPort · import customs: Held, unconfirmed",
      "Road · Turia Global Forwarding",
      "QuerétaroConsignee",
    ]);
    expect(items.filter((item) => item.hasAttribute("aria-current"))).toEqual([items[4]]);
  });
});
