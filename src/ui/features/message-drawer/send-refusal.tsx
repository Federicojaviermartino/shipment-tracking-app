"use client";

import type { CommandResult } from "@/application/estela";
import { Button } from "@/ui/kit/button";
import { InlineMessage } from "@/ui/kit/inline-message";
import { refusalText } from "./use-command";

type SendRefusalProps = {
  result: Extract<CommandResult, { ok: false }>;
  onReload: () => void;
};

/** Why the gateway did not send the message, next to the button that was pressed. */
export function SendRefusal({ result, onReload }: SendRefusalProps) {
  if (result.reason !== "outdated") {
    return <InlineMessage role="alert">{refusalText(result)}</InlineMessage>;
  }
  return (
    <div className="flex items-center gap-3">
      <InlineMessage role="alert" className="min-w-0 flex-1">
        The estimate changed while this draft was open.
      </InlineMessage>
      <Button size="sm" onClick={onReload}>
        Reload the draft
      </Button>
    </div>
  );
}
