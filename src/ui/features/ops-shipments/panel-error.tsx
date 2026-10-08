"use client";

import type { ReactNode } from "react";
import { Button } from "@/ui/kit/button";
import { InlineMessage } from "@/ui/kit/inline-message";

type PanelErrorProps = {
  /** What could not be loaded, in one sentence. */
  children: ReactNode;
  onRetry: () => void;
};

/** A panel that failed to load says so in its own place, and offers to try again. */
export function PanelError({ children, onRetry }: PanelErrorProps) {
  return (
    <div className="flex items-center gap-3">
      <InlineMessage role="alert">{children}</InlineMessage>
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
