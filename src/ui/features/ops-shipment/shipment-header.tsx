import { clsx } from "clsx";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { OpsShipmentView, RouteView } from "@/application/views";
import { HEALTH_LABEL } from "@/domain/labels";
import { buttonStyles } from "@/ui/kit/button-styles";
import { Card } from "@/ui/kit/card";
import { Lane } from "@/ui/kit/lane";
import { type RouteProblem, RouteStrip } from "@/ui/kit/route-strip";
import { StatusPill } from "@/ui/kit/status-pill";

type Problem = RouteView["stops"][number]["problem"];

// A hold that rests on a reading nobody has confirmed is drawn hollow, on the strip as in the pill.
function routeProblem(problem: Problem, unconfirmed: boolean): RouteProblem | undefined {
  if (problem === null) {
    return undefined;
  }
  return {
    status: problem,
    label: HEALTH_LABEL[problem],
    unconfirmed: problem === "held" && unconfirmed,
  };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-label">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Which shipment this is, how it stands, what it carries, and the journey as one line. */
export function ShipmentHeader({ shipment }: { shipment: OpsShipmentView }) {
  const { account, stage, cargo, voyage, route } = shipment;
  const unconfirmed = shipment.case?.needsConfirmation ?? false;

  return (
    <header>
      <Link href="/ops" className={clsx(buttonStyles({ variant: "link", size: "sm" }), "gap-1")}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Shipments
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="font-mono text-2xl font-semibold">{shipment.id}</h1>
        <p className="text-base">
          Order {shipment.orderRef} · {account.name}{" "}
          <span className="text-ink-600">({account.type})</span>
        </p>
        <StatusPill
          status={shipment.health}
          size="md"
          unconfirmed={unconfirmed}
          qualifier={unconfirmed ? "unconfirmed" : undefined}
        >
          {shipment.healthLabel}
        </StatusPill>
        {/* Once delivered, the pill has already said the only stage there is. */}
        {stage.code !== "delivered" && (
          <p>
            {stage.label}
            {stage.detail && <span className="text-ink-600"> · {stage.detail}</span>}
          </p>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        <Fact label="Lane">
          <Lane from={shipment.origin.siteName} to={shipment.destination.name} />
        </Fact>
        <Fact label="Incoterm">{shipment.incotermLine}</Fact>
        <Fact label="Cargo">
          {cargo.packages} · {cargo.description} ·{" "}
          <span className="tabular-nums">{cargo.grossWeightKg.toLocaleString("en-GB")} kg</span>
        </Fact>
        {cargo.container && (
          <Fact label="Container">
            {cargo.container.size}{" "}
            <span className="font-mono text-xs">{cargo.container.number}</span>
          </Fact>
        )}
        {voyage && (
          <Fact label="Vessel and voyage">
            {voyage.vessel} <span className="font-mono text-xs">{voyage.voyage}</span>
          </Fact>
        )}
      </dl>

      <Card className="mt-4 px-6 pt-4 pb-5">
        <RouteStrip
          variant="full"
          stops={route.stops.map((stop) => ({
            ...stop,
            problem: routeProblem(stop.problem, unconfirmed),
          }))}
          legs={route.legs.map((leg) => ({
            ...leg,
            problem: routeProblem(leg.problem, unconfirmed),
          }))}
          position={route.position}
          stale={route.stale}
        />
      </Card>
    </header>
  );
}
