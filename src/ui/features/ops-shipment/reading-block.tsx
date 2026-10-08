"use client";

import type { ReadingView, StepView } from "@/application/views";
import type { ShipmentId } from "@/domain/shipment";
import { ConfirmReadingButton } from "@/ui/features/message-drawer/confirm-reading-button";
import { AiBlock } from "@/ui/kit/ai-block";
import { ShowOriginal } from "@/ui/kit/show-original";
import { originalMessage } from "./original-message";
import { readingState } from "./reading-state";

type ReadingBlockProps = {
  shipmentId: ShipmentId;
  reading: ReadingView;
  /** The step that asks for the review: it says whether this persona may give it. */
  step: StepView;
};

/**
 * What a model read in an operator's free text, next to the text itself. Until a person
 * confirms it, it is the model's word: the two buttons are that person's verdict.
 */
export function ReadingBlock({ shipmentId, reading, step }: ReadingBlockProps) {
  const pending = reading.state === "ai_pending";
  const disabledReason = step.allowed
    ? undefined
    : (step.disabledReason ?? "Not available right now.");

  return (
    <AiBlock
      density="compact"
      state={{ kind: "reading", ...readingState(!pending, reading.reviewedBy) }}
      footer={pending ? "It counts as a fact only once a person confirms it." : undefined}
      className="mt-2"
    >
      <p>{reading.text}</p>
      {reading.original && (
        <ShowOriginal messages={[originalMessage(reading.original)]} className="mt-1" />
      )}
      {pending && (
        <div className="mt-2 flex gap-2">
          <ConfirmReadingButton
            shipmentId={shipmentId}
            eventKey={reading.eventKey}
            accepted
            variant="primary"
            disabledReason={disabledReason}
          >
            {step.action}
          </ConfirmReadingButton>
          <ConfirmReadingButton
            shipmentId={shipmentId}
            eventKey={reading.eventKey}
            accepted={false}
            disabledReason={disabledReason}
          >
            Not right
          </ConfirmReadingButton>
        </div>
      )}
    </AiBlock>
  );
}
