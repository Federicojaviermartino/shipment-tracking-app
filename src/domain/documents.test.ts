import { describe, expect, test } from "vitest";
import { defaultFileName, documentStatuses, isCustomerVisible, requirementsFor } from "./documents";
import type { LoggedEvent } from "./log";
import type { Shipment } from "./shipment";
import {
  at,
  confirmed,
  documentOnFile,
  documentSent,
  oceanShipment,
  roadShipment,
  VALENCIA,
} from "./test-support";
import { buildTimeline } from "./fold";

const statuses = (shipment: Shipment, events: LoggedEvent[]) =>
  Object.fromEntries(
    documentStatuses(shipment, buildTimeline(shipment, events), events).map((document) => [
      document.docType,
      document.status,
    ]),
  );

const ocean = oceanShipment();
const journey = (count: number): LoggedEvent[] =>
  ocean.plan
    .slice(0, count)
    .map((m) => confirmed(ocean, m.code, m.plannedAt, { precision: m.precision }));

describe("what each lane requires", () => {
  test("ocean: invoice, packing list, export declaration, bill of lading, proof of delivery", () => {
    expect(requirementsFor(ocean).map((requirement) => requirement.docType)).toEqual([
      "commercial_invoice",
      "packing_list",
      "export_declaration",
      "bill_of_lading",
      "proof_of_delivery",
    ]);
  });

  test("international road travels on a CMR, domestic road on a delivery note", () => {
    const international = roadShipment();
    const domestic = roadShipment({
      consignee: { name: "Murcia warehouse", place: { ...VALENCIA, name: "Murcia" } },
    });
    expect(requirementsFor(international).map((r) => r.docType)).toEqual([
      "cmr",
      "proof_of_delivery",
    ]);
    expect(requirementsFor(domestic).map((r) => r.docType)).toEqual([
      "delivery_note",
      "proof_of_delivery",
    ]);
  });
});

describe("status: not yet due is not missing, and pending is not missing either", () => {
  test("nothing is due on a shipment that has only been booked", () => {
    expect(statuses(ocean, journey(1))).toEqual({
      commercial_invoice: "not_yet_due",
      packing_list: "not_yet_due",
      export_declaration: "not_yet_due",
      bill_of_lading: "not_yet_due",
      proof_of_delivery: "not_yet_due",
    });
  });

  test("once collected, the exporter's own papers are missing if they are not on file", () => {
    const events = [...journey(3), documentOnFile(ocean, "packing_list", at("2026-09-16 12:00"))];
    expect(statuses(ocean, events)).toMatchObject({
      commercial_invoice: "missing",
      packing_list: "on_file",
      export_declaration: "not_yet_due",
      bill_of_lading: "not_yet_due",
    });
  });

  test("a bill of lading cannot exist before loading: only then can it be missing", () => {
    expect(statuses(ocean, journey(4)).bill_of_lading).toBe("not_yet_due");
    expect(statuses(ocean, journey(5)).bill_of_lading).toBe("missing");
    const issued = [...journey(5), documentOnFile(ocean, "bill_of_lading", at("2026-09-28 09:00"))];
    expect(statuses(ocean, issued).bill_of_lading).toBe("on_file");
  });

  test("the export declaration is due at the release, not before", () => {
    expect(statuses(ocean, journey(3)).export_declaration).toBe("not_yet_due");
    expect(statuses(ocean, journey(4)).export_declaration).toBe("missing");
  });

  test("a proof of delivery is pending after delivery, which is normal for days", () => {
    expect(statuses(ocean, journey(11)).proof_of_delivery).toBe("not_yet_due");
    expect(statuses(ocean, journey(12)).proof_of_delivery).toBe("pending");
    const signed = [
      ...journey(12),
      documentOnFile(ocean, "proof_of_delivery", at("2026-10-16 10:00")),
    ];
    expect(statuses(ocean, signed).proof_of_delivery).toBe("on_file");
  });

  test("a document we sent out is sent, until a newer copy is filed", () => {
    const filed = documentOnFile(ocean, "commercial_invoice", at("2026-09-16 12:00"));
    const corrected = documentSent(ocean, "commercial_invoice", "TGF", at("2026-10-13 09:20"));
    expect(statuses(ocean, [...journey(9), filed, corrected]).commercial_invoice).toBe("sent");
    expect(statuses(ocean, [...journey(3), corrected]).commercial_invoice).toBe("sent");

    const acknowledged = { ...filed, id: "doc-ack", at: at("2026-10-13 15:00") };
    expect(
      statuses(ocean, [...journey(9), filed, corrected, acknowledged]).commercial_invoice,
    ).toBe("on_file");
  });

  test("says which milestone a document is needed for", () => {
    const documents = documentStatuses(ocean, buildTimeline(ocean, []), []);
    expect(
      documents.filter((d) => d.neededFor === "EXPORT_RELEASED").map((d) => d.docType),
    ).toEqual(["commercial_invoice", "packing_list"]);
  });
});

describe("document metadata", () => {
  test("the export declaration is internal; the rest is for the consignee to see", () => {
    expect(isCustomerVisible("export_declaration")).toBe(false);
    expect(isCustomerVisible("bill_of_lading")).toBe(true);
    expect(isCustomerVisible("proof_of_delivery")).toBe(true);
  });

  test("names a file after its type and the customer's order", () => {
    expect(defaultFileName("bill_of_lading", ocean)).toBe("bill-of-lading-70001.pdf");
  });
});
