"use client";

import { useId } from "react";
import type { CaseView } from "@/application/views";
import { HEALTH_LABEL } from "@/domain/labels";
import type { ShipmentId } from "@/domain/shipment";
import type { Instant } from "@/domain/time";
import { Card } from "@/ui/kit/card";
import { StatusPill } from "@/ui/kit/status-pill";
import { CaseStep } from "./case-step";
import { EvidenceList } from "./evidence-list";

type CasePanelProps = {
  shipmentId: ShipmentId;
  caseView: CaseView;
  now: Instant;
  onViewEntry: (entryId: string) => void;
};

/** An open exception: what it is, the clock it runs on, the evidence and the steps proposed. */
export function CasePanel({ shipmentId, caseView, now, onViewEntry }: CasePanelProps) {
  const titleId = useId();
  const { clock, steps, reading, waiting, needsConfirmation } = caseView;
  const next = steps.findIndex((step) => step.state !== "done");

  return (
    <Card variant="flagged" status={caseView.health} as="section" aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {caseView.title}
          </h2>
          {clock && (
            <p className="mt-0.5">
              <span className="font-medium">{clock.label}</span>
              <span className="text-ink-600"> · {clock.detail}</span>
            </p>
          )}
        </div>
        <StatusPill
          status={caseView.health}
          size="md"
          unconfirmed={needsConfirmation}
          qualifier={needsConfirmation ? "unconfirmed" : undefined}
        >
          {HEALTH_LABEL[caseView.health]}
        </StatusPill>
      </div>

      <h3 className="mt-5 text-label">Why it is here</h3>
      <EvidenceList
        evidence={caseView.evidence}
        reviewedBy={reading?.reviewedBy ?? null}
        now={now}
        onViewEntry={onViewEntry}
      />

      <h3 className="mt-5 text-label">Proposed steps</h3>
      <ol className="mt-2">
        {steps.map((step, index) => (
          // A case has one step of a kind at most.
          <CaseStep
            key={step.kind}
            shipmentId={shipmentId}
            number={index + 1}
            step={step}
            primary={index === next}
            reading={
              reading && step.kind === "confirm_reading" && step.eventKey === reading.eventKey
                ? reading
                : null
            }
          />
        ))}
      </ol>

      {waiting && <p className="border-t border-line pt-3 font-medium">{waiting}</p>}
    </Card>
  );
}
