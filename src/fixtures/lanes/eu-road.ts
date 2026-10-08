import { EISVOGEL } from "@/adapters/operators/eisvogel/mapping";
import { IBON, type Deadline, type Place, type Shipment } from "@/domain/shipment";
import { MINUTE, type Instant, type LocalDate } from "@/domain/time";
import { at, MADRID } from "../calendar";
import type { Consignee } from "../directory";
import { eisvogelFeed, type SeedMessage, type Waypoint } from "../feed";
import { planned, present, siteOf, type SeedDocument, type SeededShipment } from "./shared";

type EuRoadBase = {
  id: string;
  orderRef: string;
  siteId: string;
  consignee: Consignee;
  committed: LocalDate;
  incoterm: Shipment["incoterm"]["code"];
  cargo: Shipment["cargo"];
  sendungsnr: string;
  /** When the consignee-signed CMR came back, Madrid wall-clock. Days later is normal. */
  proofOfDelivery?: string;
};

/** A stretch of driving along a route. Times are wall-clock, the same from Spain to Germany. */
export type Drive = { from: string; to: string; route: Waypoint[] };

/**
 * A full load on Eisvogel's own fleet: picked up, driven, delivered, with a telematics position
 * every 30 minutes while the truck is moving. Times are local to where things happen.
 */
export type FullLoadRow = EuRoadBase & {
  plan: { booked: string; pickedUp: string; delivered: string };
  actual: { booked: string; pickedUp?: string; drives?: Drive[]; delivered?: string };
};

const PING_EVERY = 30 * MINUTE;

function positionsAlong(drive: Drive): { waypoint: Waypoint; at: Instant }[] {
  const start = at(drive.from, MADRID);
  const end = at(drive.to, MADRID);
  const last = drive.route.length - 1;
  const pings: { waypoint: Waypoint; at: Instant }[] = [];
  for (let time = start + PING_EVERY; time <= end; time += PING_EVERY) {
    const progress = ((time - start) / (end - start)) * last;
    const behind = drive.route[Math.floor(progress)];
    const ahead = drive.route[Math.ceil(progress)];
    const nearest = drive.route[Math.round(progress)];
    if (!behind || !ahead || !nearest) continue;
    const share = progress - Math.floor(progress);
    pings.push({
      at: time,
      waypoint: {
        name: nearest.name,
        country: nearest.country,
        lat: Number((behind.lat + (ahead.lat - behind.lat) * share).toFixed(2)),
        lon: Number((behind.lon + (ahead.lon - behind.lon) * share).toFixed(2)),
      },
    });
  }
  return pings;
}

function base(row: EuRoadBase, telematics: boolean) {
  const site = siteOf(row.siteId);
  const destination = row.consignee.place;
  const shipment: Omit<Shipment, "plan" | "deadlines"> = {
    id: row.id,
    orderRef: row.orderRef,
    accountId: row.consignee.accountId,
    originSiteId: site.id,
    consignee: { name: row.consignee.name, place: destination },
    incoterm: { code: row.incoterm, place: destination.name },
    cargo: row.cargo,
    committedDate: row.committed,
    sections: [
      {
        id: "road",
        kind: "road",
        operatorId: EISVOGEL,
        from: site.place,
        to: destination,
        telematics,
      },
    ],
    refs: [{ operatorId: EISVOGEL, kind: "expedition", value: row.sendungsnr }],
  };
  return { site, destination, shipment };
}

function paperwork(row: EuRoadBase, pickedUp: Instant | undefined): SeedDocument[] {
  return present<SeedDocument>([
    pickedUp !== undefined && { docType: "cmr", at: pickedUp, source: IBON },
    row.proofOfDelivery !== undefined && {
      docType: "proof_of_delivery",
      at: at(row.proofOfDelivery, MADRID),
      source: EISVOGEL,
    },
  ]);
}

export function fullLoadShipment(row: FullLoadRow): SeededShipment {
  const { site, destination, shipment } = base(row, true);
  const reporters = [EISVOGEL];
  const plannedDelivery = at(row.plan.delivered, destination.zone);
  const eisvogel = eisvogelFeed(row.sendungsnr, { at: plannedDelivery, zone: destination.zone });
  const { actual } = row;

  const messages = present<SeedMessage>([
    actual.pickedUp && eisvogel.milestone("PICKED_UP", site.place, actual.pickedUp, true),
    ...(actual.drives ?? []).flatMap((drive) =>
      positionsAlong(drive).map((ping) => eisvogel.position(ping.waypoint, ping.at, MADRID)),
    ),
    actual.delivered && eisvogel.milestone("DELIVERED", destination, actual.delivered),
  ]);

  return {
    shipment: {
      ...shipment,
      plan: [
        planned("BOOKED", null, site.place, at(row.plan.booked, MADRID), "minute", [IBON]),
        planned(
          "PICKED_UP",
          "road",
          site.place,
          at(row.plan.pickedUp, MADRID),
          "minute",
          reporters,
        ),
        planned("DELIVERED", "road", destination, plannedDelivery, "minute", reporters),
      ],
      deadlines: [],
    },
    bookedAt: at(actual.booked, MADRID),
    messages,
    documents: paperwork(row, actual.pickedUp ? at(actual.pickedUp, MADRID) : undefined),
  };
}

type GroupageTimes = {
  pickedUp: string;
  depotIn: string;
  depotOut: string;
  hubIn: string;
  hubOut: string;
  outForDelivery: string;
  delivered: string;
};

/**
 * Groupage through Eisvogel's network: collected, consolidated at the origin depot, trunked to a
 * transit hub and delivered on a round. Tracked by hub scans only. The delivery ETA rides on the
 * pickup, the transit-hub arrival and the delivery-round payloads.
 */
export type GroupageRow = EuRoadBase & {
  depot: Place;
  hub: Place;
  plan: GroupageTimes & { booked: string };
  actual: Partial<GroupageTimes> & { booked: string };
  deadlines?: Deadline[];
};

export function groupageShipment(row: GroupageRow): SeededShipment {
  const { site, destination, shipment } = base(row, false);
  const reporters = [EISVOGEL];
  const plannedDelivery = at(row.plan.delivered, destination.zone);
  const eisvogel = eisvogelFeed(row.sendungsnr, { at: plannedDelivery, zone: destination.zone });
  const { plan, actual } = row;

  const messages = present<SeedMessage>([
    actual.pickedUp && eisvogel.milestone("PICKED_UP", site.place, actual.pickedUp, true),
    actual.depotIn && eisvogel.milestone("HUB_IN", row.depot, actual.depotIn),
    actual.depotOut && eisvogel.milestone("HUB_OUT", row.depot, actual.depotOut),
    actual.hubIn && eisvogel.milestone("HUB_IN", row.hub, actual.hubIn, true),
    actual.hubOut && eisvogel.milestone("HUB_OUT", row.hub, actual.hubOut),
    actual.outForDelivery &&
      eisvogel.milestone("OUT_FOR_DELIVERY", destination, actual.outForDelivery, true),
    actual.delivered && eisvogel.milestone("DELIVERED", destination, actual.delivered),
  ]);

  return {
    shipment: {
      ...shipment,
      plan: [
        planned("BOOKED", null, site.place, at(plan.booked, MADRID), "minute", [IBON]),
        planned("PICKED_UP", "road", site.place, at(plan.pickedUp, MADRID), "minute", reporters),
        planned("HUB_IN", "road", row.depot, at(plan.depotIn, row.depot.zone), "minute", reporters),
        planned(
          "HUB_OUT",
          "road",
          row.depot,
          at(plan.depotOut, row.depot.zone),
          "minute",
          reporters,
        ),
        planned("HUB_IN", "road", row.hub, at(plan.hubIn, row.hub.zone), "minute", reporters),
        planned("HUB_OUT", "road", row.hub, at(plan.hubOut, row.hub.zone), "minute", reporters),
        planned(
          "OUT_FOR_DELIVERY",
          "road",
          destination,
          at(plan.outForDelivery, destination.zone),
          "minute",
          reporters,
        ),
        planned("DELIVERED", "road", destination, plannedDelivery, "minute", reporters),
      ],
      deadlines: row.deadlines ?? [],
    },
    bookedAt: at(actual.booked, MADRID),
    messages,
    documents: paperwork(row, actual.pickedUp ? at(actual.pickedUp, MADRID) : undefined),
  };
}
