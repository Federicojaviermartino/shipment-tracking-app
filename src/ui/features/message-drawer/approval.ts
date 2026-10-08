import type { OpsCommand } from "@/application/estela";
import { ungroundedDates } from "@/application/text/grounding";
import type { Draft } from "@/application/views";
import { assertNever } from "@/ui/kit/assert-never";

export type MessageText = { subject: string; body: string };

/** Whether a reviewed draft can go out, and as which command; or what has to be fixed first. */
export type Approval = { ready: true; command: OpsCommand } | { ready: false; reason: string };

const NO_RECIPIENT = "Nobody is on file to receive this.";

function blocked(reason: string): Approval {
  return { ready: false, reason };
}

/**
 * The sentence under a field that mentions a date the record does not have. The same guard runs
 * in the gateway on sending; here it speaks while the text is still being written.
 */
export function strayDates(text: string, draft: Draft): string | undefined {
  const dates = ungroundedDates(text, draft.facts);
  if (dates.length === 0) {
    return undefined;
  }
  const subject = dates.length === 1 ? "This date is" : "These dates are";
  return `${subject} not in the shipment record: ${dates.join(", ")}`;
}

export function approval(draft: Draft, text: MessageText, fileName: string | null): Approval {
  const { subject, body } = text;
  if (ungroundedDates(`${subject}\n${body}`, draft.facts).length > 0) {
    return blocked("Fix the date that is not in the shipment record.");
  }
  if (!subject.trim() || !body.trim()) {
    return blocked("Write a subject and a message first.");
  }

  const message = { shipmentId: draft.shipmentId, exception: draft.exception, subject, body };
  switch (draft.step) {
    case "notify_customer":
      return {
        ready: true,
        // The day the approver was shown: the gateway refuses the notice if it has moved since.
        command: { type: "send_notice", ...message, expectedDay: draft.publishes?.day ?? null },
      };
    case "contact_operator":
      return draft.operatorId === null
        ? blocked(NO_RECIPIENT)
        : {
            ready: true,
            command: { type: "contact_operator", ...message, operatorId: draft.operatorId },
          };
    case "send_document":
      if (draft.attachment === null) {
        return blocked(NO_RECIPIENT);
      }
      if (fileName === null) {
        return blocked("Attach a file first.");
      }
      return {
        ready: true,
        command: {
          type: "send_document",
          ...message,
          docType: draft.attachment.docType,
          fileName,
        },
      };
    default:
      return assertNever(draft.step);
  }
}
