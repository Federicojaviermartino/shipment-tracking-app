import { useMutation } from "@tanstack/react-query";
import type { CommandResult, OpsCommand } from "@/application/estela";
import { useToast } from "@/ui/kit/toast";
import { useOpsSession } from "@/ui/shell/session";

/** What a refusal says to the person who tried. An unknown shipment has no message of its own. */
export function refusalText(result: Extract<CommandResult, { ok: false }>): string {
  return result.reason === "not_found" ? "We couldn't find that shipment." : result.message;
}

/**
 * Runs a command as the signed-in persona. The screens are refreshed by the log itself, so
 * the caller only has to say what happens with the answer. `onResult` is given here and not
 * to `mutate`: a step that is done removes its own button, and the answer must still land.
 */
export function useCommand(onResult: (result: CommandResult) => void) {
  const { estela, actor } = useOpsSession();
  const toast = useToast();

  return useMutation({
    mutationFn: (command: OpsCommand) => estela.ops.execute(actor, command),
    onSuccess: onResult,
    onError: () => toast.show({ title: "That did not go through. Try again.", error: true }),
  });
}
