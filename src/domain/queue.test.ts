import { describe, expect, test } from "vitest";
import type { ExceptionHealth, ShipmentException } from "./exceptions";
import { compareQueueRows, primaryException, type QueueRow } from "./queue";
import { at } from "./test-support";

function exception(
  id: string,
  health: ExceptionHealth,
  options: { actBy?: string; state?: ShipmentException["state"] } = {},
): ShipmentException {
  return {
    id,
    type: "delay",
    health,
    basis: "rule",
    since: 0,
    ...(options.actBy ? { actBy: { at: at(options.actBy), label: "clock" } } : {}),
    evidence: [],
    steps: [],
    state: options.state ?? "needs_action",
  };
}

const ordered = (rows: QueueRow[]) =>
  [...rows].sort(compareQueueRows).map((row) => row.exception.id);

describe("queue order", () => {
  test("the nearest clock comes first and a case without a clock comes last", () => {
    const rows: QueueRow[] = [
      { committedDate: "2026-10-08", exception: exception("stale", "stale") },
      {
        committedDate: "2026-10-09",
        exception: exception("free-time", "held", { actBy: "2026-10-10 07:59" }),
      },
      {
        committedDate: "2026-10-30",
        exception: exception("cut-off", "at_risk", { actBy: "2026-10-08 12:00" }),
      },
      {
        committedDate: "2026-10-06",
        exception: exception("now", "delayed", { actBy: "2026-10-07 16:00" }),
      },
      {
        committedDate: "2026-10-08",
        exception: exception("linehaul", "at_risk", { actBy: "2026-10-07 20:00" }),
      },
    ];
    expect(ordered(rows)).toEqual(["now", "linehaul", "cut-off", "free-time", "stale"]);
  });

  test("ranks by clock, not by how bad the health is", () => {
    const rows: QueueRow[] = [
      {
        committedDate: "2026-10-09",
        exception: exception("held-later", "held", { actBy: "2026-10-09 23:59" }),
      },
      {
        committedDate: "2026-10-08",
        exception: exception("at-risk-sooner", "at_risk", { actBy: "2026-10-07 20:00" }),
      },
    ];
    expect(ordered(rows)).toEqual(["at-risk-sooner", "held-later"]);
  });

  test("breaks a tie on the clock by health, then by the earlier committed date", () => {
    const sameClock = { actBy: "2026-10-07 16:00" };
    const rows: QueueRow[] = [
      { committedDate: "2026-10-06", exception: exception("at-risk", "at_risk", sameClock) },
      { committedDate: "2026-10-09", exception: exception("delayed-later", "delayed", sameClock) },
      {
        committedDate: "2026-10-06",
        exception: exception("delayed-earlier", "delayed", sameClock),
      },
      { committedDate: "2026-10-12", exception: exception("held", "held", sameClock) },
    ];
    expect(ordered(rows)).toEqual(["held", "delayed-earlier", "delayed-later", "at-risk"]);
  });

  test("orders cases without a clock by health and committed date too", () => {
    const rows: QueueRow[] = [
      { committedDate: "2026-10-09", exception: exception("stale-later", "stale") },
      { committedDate: "2026-10-08", exception: exception("stale-earlier", "stale") },
      { committedDate: "2026-10-20", exception: exception("held", "held") },
    ];
    expect(ordered(rows)).toEqual(["held", "stale-earlier", "stale-later"]);
  });
});

describe("the primary exception of a shipment", () => {
  test("is the worst one", () => {
    const worst = primaryException([exception("stale", "stale"), exception("held", "held")]);
    expect(worst?.id).toBe("held");
  });

  test("is the worst one that still needs action when the worst overall is only waiting", () => {
    const primary = primaryException([
      exception("held", "held", { state: "waiting" }),
      exception("delayed", "delayed"),
      exception("stale", "stale"),
    ]);
    expect(primary?.id).toBe("delayed");
  });

  test("is the worst one being waited on when nothing needs action", () => {
    const primary = primaryException([
      exception("stale", "stale", { state: "waiting" }),
      exception("held", "held", { state: "waiting" }),
    ]);
    expect(primary?.id).toBe("held");
  });

  test("a shipment without exceptions has none", () => {
    expect(primaryException([])).toBeNull();
  });
});
