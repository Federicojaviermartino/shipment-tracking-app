import { useQuery } from "@tanstack/react-query";
import type { QueueView } from "@/application/estela";
import type { ShipmentFilter } from "@/domain/filters";
import { opsQueries } from "@/ui/hooks/queries";
import { useOpsSession } from "@/ui/shell/session";

/**
 * The rows of a view under a filter. While a changed filter is being answered the rows of the
 * previous one stay, instead of flashing a skeleton; never those of another persona or view.
 */
export function useShipmentRows(view: QueueView, filter: ShipmentFilter) {
  const { estela, actor } = useOpsSession();

  return useQuery({
    ...opsQueries.shipments(estela, actor, view, filter),
    placeholderData: (previous, query) => {
      const [userId, , , previousView] = query?.queryKey ?? [];
      return userId === actor.userId && previousView === view ? previous : undefined;
    },
  });
}
