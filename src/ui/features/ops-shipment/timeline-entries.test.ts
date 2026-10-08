import { describe, expect, test } from "vitest";
import { startEstela } from "@/composition/test-support";
import { timelineRows } from "./timeline-entries";

type World = Awaited<ReturnType<typeof startEstela>>;

// The rows of one section of a shipment, as Marta Soler's page would feed them to the kit.
async function rowsOf({ estela, marta }: World, shipmentId: string, sectionId: string) {
  const shipment = await estela.ops.shipment(marta, shipmentId);
  const section = shipment?.timeline.sections.find((candidate) => candidate.id === sectionId);
  if (!shipment || !section) {
    throw new Error(`${shipmentId} has no section ${sectionId}.`);
  }
  return timelineRows(section.entries, { now: estela.now(), dates: shipment.dates });
}

describe("timelineRows", () => {
  test("keeps an operator estimate that Estela agrees with as a single row", async () => {
    const world = await startEstela();

    const rows = await rowsOf(world, "EST-4058", "final-leg");

    expect(rows).toMatchObject([
      {
        id: "DELIVERED@QUERETARO",
        mark: "declared",
        superseded: false,
        when: { day: "Wed 14 Oct" },
      },
    ]);
  });

  test("strikes a superseded door estimate and sets Estela's beside it", async () => {
    const world = await startEstela();
    await world.estela.demo.send("A");

    const rows = await rowsOf(world, "EST-4058", "final-leg");

    expect(rows).toMatchObject([
      {
        id: "DELIVERED@QUERETARO",
        mark: "declared",
        superseded: true,
        when: { day: "Wed 14 Oct" },
        detail: "Turia Global Forwarding · declared Tue 6 Oct, before the vessel delay",
      },
      { id: "DELIVERED@QUERETARO:estela", mark: "estimated", when: { day: "Fri 16 Oct" } },
    ]);
  });

  test("quotes the operator's remark and the plan a new estimate moved away from", async () => {
    const world = await startEstela();
    await world.estela.demo.send("A");

    const rows = await rowsOf(world, "EST-4058", "sea");

    expect(rows.at(-1)).toMatchObject({
      mark: "declared",
      label: "Vessel arrived, Veracruz",
      when: { day: "Sun 11 Oct", time: "08:00" },
      was: { day: "Fri 9 Oct", time: "06:00" },
      detail: expect.stringMatching(/^Noray Lines · declared just now · “WEA: Port closed/),
    });
  });

  test("shows a withdrawn estimate struck through, never as a live date", async () => {
    const world = await startEstela();

    const rows = await rowsOf(world, "EST-4012", "final-leg");

    expect(rows).toMatchObject([
      {
        mark: "declared",
        superseded: true,
        when: { day: "Wed 7 Oct" },
        detail: "Turia Global Forwarding · withdrawn 7 h ago",
      },
      { mark: "estimated", when: { day: "Fri 9 Oct" } },
    ]);
  });

  test("puts Estela's step where the plan was missed, and the plan where it holds", async () => {
    const world = await startEstela();

    const missed = await rowsOf(world, "EST-4134", "road");
    const onPlan = await rowsOf(world, "EST-4147", "road");

    expect(missed.find((row) => row.id === "HUB_OUT@PERPIGNAN")).toMatchObject({
      mark: "estimated",
      when: { day: "Wed 7 Oct", time: "20:00" },
      was: { day: "Tue 6 Oct", time: "20:00" },
    });
    expect(onPlan.map((row) => row.mark)).toEqual(["planned", "planned", "planned", "planned"]);
  });

  test("marks a hold that only a model has read, with the message it was read from", async () => {
    const world = await startEstela();

    const rows = await rowsOf(world, "EST-4012", "destination-port");
    const hold = rows.find((row) => row.mark === "hold");

    expect(hold).toMatchObject({
      reading: {},
      detail: "Turia Global Forwarding · Email · 22 h ago",
      originals: [{ source: "Turia Global Forwarding", receivedAt: "Tue 6 Oct 17:55 Zaragoza" }],
    });
    expect(hold?.reading).not.toHaveProperty("confirmedBy");
    expect(hold?.id).not.toMatch(/\s/);
  });

  test("draws the last position of a silent truck as stale", async () => {
    const world = await startEstela();

    const rows = await rowsOf(world, "EST-4127", "road");

    expect(rows.find((row) => row.mark === "stale_position")).toMatchObject({
      label: "Last position: La Jonquera, ES",
      detail: "17 positions · Eisvogel Spedition · 27 h ago",
    });
  });
});
