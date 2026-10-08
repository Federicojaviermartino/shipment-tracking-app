import type { MilestoneCode } from "@/domain/shipment";

export const EISVOGEL = "EVS";

type EisvogelMeaning = { text: string } & (
  { kind: "milestone"; milestone: MilestoneCode } | { kind: "position" }
);

/** Status code to meaning. Anything that is not listed is kept as a note. */
export const EISVOGEL_STATUS: Record<string, EisvogelMeaning> = {
  "300": { text: "Abgeholt", kind: "milestone", milestone: "PICKED_UP" },
  "400": { text: "Umschlag Eingang", kind: "milestone", milestone: "HUB_IN" },
  "410": { text: "Umschlag Ausgang", kind: "milestone", milestone: "HUB_OUT" },
  "510": { text: "Unterwegs", kind: "position" },
  "600": { text: "In Zustellung", kind: "milestone", milestone: "OUT_FOR_DELIVERY" },
  "700": { text: "Zugestellt", kind: "milestone", milestone: "DELIVERED" },
};
