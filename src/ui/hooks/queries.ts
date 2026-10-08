import { queryOptions } from "@tanstack/react-query";
import type { Estela, QueueView } from "@/application/estela";
import type { ShipmentFilter } from "@/domain/filters";
import type { ExternalActor, InternalActor } from "@/domain/perimeter";
import type { StepKind } from "@/domain/playbook";
import type { ShipmentId } from "@/domain/shipment";

/**
 * Every read of the gateway, as a query. Keys start with the actor, so that switching persona can
 * never show another persona's cache.
 */
export const opsQueries = {
  overview: (estela: Estela, actor: InternalActor) =>
    queryOptions({
      queryKey: [actor.userId, "ops", "overview"],
      queryFn: () => estela.ops.overview(actor),
    }),
  highlight: (estela: Estela, actor: InternalActor) =>
    queryOptions({
      queryKey: [actor.userId, "ops", "highlight"],
      queryFn: () => estela.ops.highlight(actor),
    }),
  shipments: (estela: Estela, actor: InternalActor, view: QueueView, filter: ShipmentFilter) =>
    queryOptions({
      queryKey: [actor.userId, "ops", "shipments", view, filter],
      queryFn: () => estela.ops.shipments(actor, { view, filter }),
    }),
  shipment: (estela: Estela, actor: InternalActor, id: ShipmentId) =>
    queryOptions({
      queryKey: [actor.userId, "ops", "shipment", id],
      queryFn: () => estela.ops.shipment(actor, id),
    }),
  ask: (estela: Estela, actor: InternalActor, text: string) =>
    queryOptions({
      queryKey: [actor.userId, "ops", "ask", text],
      queryFn: () => estela.ops.ask(actor, text),
    }),
  /**
   * A draft is written once per opening of the drawer and never refreshed behind the reader.
   * `static` and not `Infinity`: the live updates invalidate every query, and an invalidated
   * query is fetched again whatever its stale time. Only the drawer's own reload asks again.
   */
  draft: (estela: Estela, actor: InternalActor, id: ShipmentId, step: StepKind) =>
    queryOptions({
      queryKey: [actor.userId, "ops", "draft", id, step],
      queryFn: () => estela.ops.draft(actor, id, step),
      staleTime: "static",
      gcTime: 0,
      refetchInterval: false,
    }),
};

export const portalQueries = {
  home: (estela: Estela, actor: ExternalActor) =>
    queryOptions({
      queryKey: [actor.userId, "portal", "home"],
      queryFn: () => estela.portal.home(actor),
    }),
  shipment: (estela: Estela, actor: ExternalActor, id: ShipmentId) =>
    queryOptions({
      queryKey: [actor.userId, "portal", "shipment", id],
      queryFn: () => estela.portal.shipment(actor, id),
    }),
};
