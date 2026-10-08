import { DESK_ZONE } from "@/domain/filters";

/** The manufacturer's logistics desk as a customer knows it: who signs a notice, and from where. */
export const DESK = {
  name: "Ibón logistics",
  place: "Zaragoza",
  zone: DESK_ZONE,
  email: "logistics@ibon.example",
} as const;
