import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { vi } from "vitest";
import type { Estela } from "@/application/estela";
import type { StepView } from "@/application/views";
import type { InternalActor } from "@/domain/perimeter";
import type { StepKind } from "@/domain/playbook";
import type { ShipmentId } from "@/domain/shipment";
import { ToastHost } from "@/ui/kit/toast";
import { SessionContext } from "@/ui/shell/session";

/** jsdom has no layout: the observer that positions tooltips and dialogs has nothing to do. */
export function stubLayout() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

// As the workspace does: every change of the log asks the queries again.
function LiveQueries({ estela, children }: { estela: Estela; children: ReactNode }) {
  const queries = useQueryClient();
  useEffect(() => estela.demo.subscribe(() => void queries.invalidateQueries()), [estela, queries]);
  return children;
}

/** Renders a piece of an operations screen as one persona, against a real gateway. */
export function renderAs(estela: Estela, actor: InternalActor, ui: ReactNode) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queries}>
      <SessionContext value={{ estela, actor, now: estela.now() }}>
        <LiveQueries estela={estela}>
          <ToastHost>{ui}</ToastHost>
        </LiveQueries>
      </SessionContext>
    </QueryClientProvider>,
  );
}

/** The step of a kind in the primary case of a shipment, as that persona is given it. */
export async function stepOf(
  estela: Estela,
  actor: InternalActor,
  shipmentId: ShipmentId,
  kind: StepKind,
): Promise<StepView> {
  const shipment = await estela.ops.shipment(actor, shipmentId);
  const step = shipment?.case?.steps.find((candidate) => candidate.kind === kind);
  if (!step) {
    throw new Error(`${shipmentId} has no ${kind} step for ${actor.name}.`);
  }
  return step;
}
