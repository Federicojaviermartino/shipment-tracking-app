"use client";

import { useState } from "react";
import type { StepView } from "@/application/views";
import type { ShipmentId } from "@/domain/shipment";
import { Button } from "@/ui/kit/button";
import type { ButtonSize, ButtonVariant } from "@/ui/kit/button-styles";
import { MessageDrawer } from "./message-drawer";

type ReviewButtonProps = {
  shipmentId: ShipmentId;
  step: StepView;
  size: ButtonSize;
  variant: ButtonVariant;
};

/** Opens the review drawer for an outbound step. Nothing is drafted until it is pressed. */
export function ReviewButton({ shipmentId, step, size, variant }: ReviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {step.action}
      </Button>
      {/* Mounted per opening: every opening asks for a fresh draft and starts unedited. */}
      {open && (
        <MessageDrawer
          shipmentId={shipmentId}
          stepKind={step.kind}
          pendingTitle={step.action}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
