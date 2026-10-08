"use client";

import type { ReactNode } from "react";
import type { ShipmentId } from "@/domain/shipment";
import { Button } from "@/ui/kit/button";
import type { ButtonSize, ButtonVariant } from "@/ui/kit/button-styles";
import { useToast } from "@/ui/kit/toast";
import { refusalText, useCommand } from "./use-command";

type ConfirmReadingButtonProps = {
  shipmentId: ShipmentId;
  /** The reading under review. */
  eventKey: string;
  /** `false` says the model misread the message: the reading is dropped. */
  accepted: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabledReason?: string;
  children: ReactNode;
};

/** A person's verdict on what a model read in an operator's free text. */
export function ConfirmReadingButton({
  shipmentId,
  eventKey,
  accepted,
  size = "sm",
  variant = "secondary",
  disabledReason,
  children,
}: ConfirmReadingButtonProps) {
  const toast = useToast();
  const review = useCommand((result) =>
    toast.show(result.ok ? { title: result.message } : { title: refusalText(result), error: true }),
  );

  return (
    <Button
      size={size}
      variant={variant}
      loading={review.isPending}
      disabledReason={disabledReason}
      onClick={() => review.mutate({ type: "confirm_reading", shipmentId, eventKey, accepted })}
    >
      {children}
    </Button>
  );
}
