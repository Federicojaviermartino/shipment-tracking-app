"use client";

import Link from "next/link";
import type { StepView } from "@/application/views";
import type { ShipmentId } from "@/domain/shipment";
import { Button } from "@/ui/kit/button";
import { buttonStyles } from "@/ui/kit/button-styles";
import { ConfirmReadingButton } from "./confirm-reading-button";
import { ReviewButton } from "./review-button";

type StepActionProps = {
  shipmentId: ShipmentId;
  step: StepView;
  size?: "sm" | "md";
  /** The one primary action of its region. */
  primary?: boolean;
  /**
   * In a row of the shipments table. A reading is never confirmed from there: the button leads to
   * the shipment, where the original message can be read first.
   */
  inRow?: boolean;
};

/**
 * The button of a proposed step. It opens the review drawer, or confirms a reading in place.
 * A step that is done has no button: the caller prints who did it and when.
 */
export function StepAction({
  shipmentId,
  step,
  size = "sm",
  primary = false,
  inRow = false,
}: StepActionProps) {
  const variant = primary ? "primary" : "secondary";

  if (step.state === "done") {
    return null;
  }
  if (!step.allowed) {
    return (
      <Button
        size={size}
        variant={variant}
        disabledReason={step.disabledReason ?? "Not available right now."}
      >
        {step.action}
      </Button>
    );
  }
  if (step.kind !== "confirm_reading") {
    return <ReviewButton shipmentId={shipmentId} step={step} size={size} variant={variant} />;
  }
  if (inRow) {
    return (
      <Link href={`/ops/shipments/${shipmentId}`} className={buttonStyles({ variant, size })}>
        {step.action}
      </Link>
    );
  }
  return step.eventKey === null ? null : (
    <ConfirmReadingButton
      shipmentId={shipmentId}
      eventKey={step.eventKey}
      accepted
      size={size}
      variant={variant}
    >
      {step.action}
    </ConfirmReadingButton>
  );
}
