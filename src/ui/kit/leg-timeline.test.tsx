import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { LegTimeline } from "./leg-timeline";
import type { TimelineEntryData } from "./timeline-entry";
import type { TimelineNowData } from "./timeline-now";

const ENTRIES: TimelineEntryData[] = [
  {
    id: "lodged",
    mark: "confirmed",
    label: "Import entry lodged",
    when: { day: "Mon 5 Oct", time: "08:30", precision: "day", dateTime: "2026-10-05" },
    detail: "Turia Global Forwarding · 31 h ago",
    originals: [
      {
        id: "raw-1",
        source: "Turia Global Forwarding",
        channel: "Daily report",
        receivedAt: "Tue 6 Oct 08:30 Zaragoza",
        lang: "es",
        body: "TGF-26-03290;48176;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;05/10/2026;",
      },
    ],
  },
  { id: "scan", mark: "unreported", label: "Out of the Bilbao depot" },
  {
    id: "arrival",
    mark: "declared",
    label: "Vessel arrives in Veracruz",
    when: {
      day: "Sun 11 Oct",
      time: "08:00",
      precision: "minute",
      dateTime: "2026-10-11T08:00-06:00",
    },
    detail: "Noray Lines · 3 min ago",
    was: {
      day: "Fri 9 Oct",
      time: "06:00",
      precision: "minute",
      dateTime: "2026-10-09T06:00-06:00",
    },
  },
  {
    id: "door-operator",
    mark: "declared",
    label: "Delivery, Querétaro plant",
    when: { day: "Wed 14 Oct", precision: "day", dateTime: "2026-10-14" },
    detail: "declared Tue 6 Oct, before the vessel delay",
    superseded: true,
  },
  {
    id: "delivery",
    mark: "estimated",
    label: "Delivery in Querétaro",
    when: { day: "Fri 16 Oct", precision: "day", dateTime: "2026-10-16" },
  },
];

const NOW: TimelineNowData = {
  after: "scan",
  clock: { day: "Wed 7 Oct", time: "16:03", place: "Zaragoza", dateTime: "2026-10-07T16:03+02:00" },
};

const HOLD: TimelineEntryData = {
  id: "hold",
  mark: "hold",
  label: "Customs hold: gross weight differs",
  when: { day: "Tue 6 Oct", precision: "day", dateTime: "2026-10-06" },
  detail: "Turia Global Forwarding · email · 22 h ago",
};

function renderTimeline(
  audience: "ops" | "customer",
  entries: TimelineEntryData[] = ENTRIES,
  now: TimelineNowData = NOW,
) {
  render(
    <LegTimeline
      audience={audience}
      mode="sea"
      title="Sea"
      detail="Noray Lines · NORAY ALTAIR 612W"
      entries={entries}
      now={now}
    />,
  );
  return within(screen.getByRole("region", { name: /Sea/ }));
}

function rowOf(section: ReturnType<typeof within>, label: string) {
  return section.getByText(label).closest("li");
}

describe("LegTimeline", () => {
  test("is a named section with its entries in an ordered list, the Now rule among them", () => {
    const section = renderTimeline("ops");

    const rows = section.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toHaveLength(ENTRIES.length + 1);
    expect(rows[2]).toContain("Now");
  });

  test("says where and on which day it is now, because the rows are in their own local time", () => {
    const section = renderTimeline("ops");

    const now = section.getAllByRole("listitem")[2];
    expect(now).toHaveTextContent("Wed 7 Oct 16:03");
    expect(now).toHaveTextContent("Zaragoza");
    expect(now?.querySelector("time")).toHaveAttribute("datetime", "2026-10-07T16:03+02:00");
  });

  test("gives every date a machine-readable value and no time of day at day precision", () => {
    const section = renderTimeline("ops");

    const lodged = rowOf(section, "Import entry lodged");
    expect(lodged?.querySelector("time")).toHaveAttribute("datetime", "2026-10-05");
    expect(lodged).not.toHaveTextContent("08:30");

    const arrival = rowOf(section, "Vessel arrives in Veracruz");
    expect(arrival?.querySelector("time")).toHaveTextContent("08:00");
  });

  test("says that a milestone was not reported instead of giving it a date", () => {
    const section = renderTimeline("ops");

    const scan = rowOf(section, "Out of the Bilbao depot");
    expect(scan).toHaveTextContent("Not reported");
    expect(scan?.querySelector("time")).toBeNull();
  });

  test("speaks to operations in their vocabulary, with the source", () => {
    const section = renderTimeline("ops");

    expect(section.getByText("Confirmed · Turia Global Forwarding · 31 h ago")).toBeInTheDocument();
    expect(section.getByText(/Operator estimate · Noray Lines · 3 min ago/)).toBeInTheDocument();
    expect(section.getByText("Estela estimate")).toBeInTheDocument();
  });

  test("strikes an overtaken date and the value it replaced, and says so in words", () => {
    const section = renderTimeline("ops");

    const overtaken = rowOf(section, "Delivery, Querétaro plant");
    expect(overtaken?.querySelector("s")).toHaveTextContent("Wed 14 Oct (superseded)");

    const arrival = rowOf(section, "Vessel arrives in Veracruz");
    expect(arrival).toHaveTextContent("was Fri 9 Oct 06:00 (superseded)");
    expect(
      within(arrival as HTMLElement)
        .getByText("Fri 9 Oct")
        .closest("s"),
    ).toBeInTheDocument();
  });

  test("says in words that an update is overdue, where the rail only shows a hatch", () => {
    const section = renderTimeline("customer", ENTRIES, { ...NOW, stale: true });

    expect(section.getAllByRole("listitem")[2]).toHaveTextContent(
      "No update since the entry above.",
    );
  });

  test("draws a hold that only a model has read as hollow, and fills it in once confirmed", () => {
    const pending = renderTimeline("ops", [{ ...HOLD, reading: {} }]);
    expect(pending.getByText("Read by AI, confirm")).toBeInTheDocument();
    expect(rowOf(pending, HOLD.label)?.querySelector("svg rect")).toHaveAttribute("fill", "none");

    const confirmed = within(
      render(
        <LegTimeline
          audience="ops"
          mode="port"
          title="Port of Veracruz"
          entries={[{ ...HOLD, id: "hold-later", reading: { confirmedBy: "Marta Soler" } }]}
        />,
      ).container,
    );
    expect(confirmed.getByText("Read by AI · confirmed by Marta Soler")).toBeInTheDocument();
    expect(rowOf(confirmed, HOLD.label)?.querySelector("svg rect")).toHaveAttribute(
      "fill",
      "currentColor",
    );
  });

  test("shows the operator's original message to operations on demand", async () => {
    const section = renderTimeline("ops");

    expect(section.queryByText(/PEDIMENTO PRESENTADO/)).not.toBeInTheDocument();
    await userEvent.click(section.getByRole("button", { name: "Show original" }));

    expect(section.getByText(/PEDIMENTO PRESENTADO/)).toHaveAttribute("lang", "es");
    expect(section.getByRole("button", { name: "Hide original" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("never offers a customer the raw operator messages or the tag of a reading", () => {
    const section = renderTimeline("customer", [
      ...ENTRIES,
      { ...HOLD, reading: { confirmedBy: "Marta Soler" } },
    ]);

    expect(section.queryByRole("button", { name: /original/i })).not.toBeInTheDocument();
    expect(section.queryByText(/PEDIMENTO PRESENTADO/)).not.toBeInTheDocument();
    expect(section.queryByText(/Read by AI/)).not.toBeInTheDocument();
  });

  test("tells a customer who stands behind an estimate", () => {
    const section = renderTimeline("customer");

    expect(section.getByText("Estimated · by Ibón logistics")).toBeInTheDocument();
    expect(section.queryByText(/Estela estimate/)).not.toBeInTheDocument();
  });
});
