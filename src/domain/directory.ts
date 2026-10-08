import type { AccountId, Country, OperatorId, Place, SiteId } from "./shipment";

export type OperatorKind = "road_carrier" | "ocean_carrier" | "forwarder";
export type Operator = { id: OperatorId; name: string; kind: OperatorKind };

export type Site = {
  id: SiteId;
  name: string;
  role: "factory" | "warehouse";
  place: Place;
  /** Other names people use for the site, such as the nearest city. */
  aliases: string[];
};

/** A subsidiary is an account like any other: the type is a label, not a rule. */
export type Account = {
  id: AccountId;
  name: string;
  type: "customer" | "subsidiary";
  country: Country;
};
