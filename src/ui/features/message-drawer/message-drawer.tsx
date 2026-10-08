"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { StepKind } from "@/domain/playbook";
import type { ShipmentId } from "@/domain/shipment";
import { opsQueries } from "@/ui/hooks/queries";
import { Button } from "@/ui/kit/button";
import { Drawer } from "@/ui/kit/drawer";
import { InlineMessage } from "@/ui/kit/inline-message";
import { useToast } from "@/ui/kit/toast";
import { useOpsSession } from "@/ui/shell/session";
import { approval, type MessageText } from "./approval";
import { ApprovalChanges } from "./approval-changes";
import { DraftReview } from "./draft-review";
import { DraftSkeleton } from "./draft-skeleton";
import { SendRefusal } from "./send-refusal";
import { useCommand } from "./use-command";

type MessageDrawerProps = {
  shipmentId: ShipmentId;
  stepKind: StepKind;
  /** The title until the draft brings its own: the words of the button that opened the drawer. */
  pendingTitle: string;
  onClose: () => void;
};

/**
 * The one gate between what a model wrote and the outside world: a person reads the draft
 * against the facts it rests on, edits it and approves it. Nothing is sent from anywhere else.
 */
export function MessageDrawer({ shipmentId, stepKind, pendingTitle, onClose }: MessageDrawerProps) {
  const { estela, actor } = useOpsSession();
  const toast = useToast();
  const query = useQuery(opsQueries.draft(estela, actor, shipmentId, stepKind));
  // `null` until the reader changes something: the text is then the draft's own.
  const [edited, setEdited] = useState<MessageText | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const send = useCommand((result) => {
    if (result.ok) {
      toast.show({ title: result.message });
      onClose();
    }
  });

  const draft = query.isFetching ? undefined : query.data;
  const refusal = send.data && !send.data.ok ? send.data : null;

  function reload() {
    setEdited(null);
    setFileName(null);
    send.reset();
    void query.refetch();
  }

  const frame = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
  };

  if (!draft) {
    return (
      <Drawer
        {...frame}
        title={pendingTitle}
        footer={<Button onClick={onClose}>{query.isFetching ? "Cancel" : "Close"}</Button>}
      >
        {query.isFetching ? (
          <DraftSkeleton />
        ) : (
          <InlineMessage>There is nothing left to send for this step.</InlineMessage>
        )}
      </Drawer>
    );
  }

  const text = edited ?? { subject: draft.subject, body: draft.body };
  const check = approval(draft, text, fileName);
  const blockedBy =
    refusal?.reason === "outdated"
      ? "Reload the draft first."
      : check.ready
        ? undefined
        : check.reason;

  return (
    <Drawer
      {...frame}
      title={draft.title}
      description={
        <>
          To: <span className="font-medium text-ink-900">{draft.to.name}</span> · {draft.to.channel}
          <span className="mt-0.5 block text-xs text-ink-500">
            Prototype: nothing leaves this browser.
          </span>
        </>
      }
      summary={
        (refusal || draft.changes) && (
          <div className="flex flex-col gap-3">
            {refusal && <SendRefusal result={refusal} onReload={reload} />}
            {draft.changes && <ApprovalChanges changes={draft.changes} />}
          </div>
        )
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={send.isPending}
            disabledReason={blockedBy}
            onClick={() => {
              if (check.ready) send.mutate(check.command);
            }}
          >
            Approve and send
          </Button>
        </>
      }
    >
      <DraftReview
        draft={draft}
        text={text}
        onTextChange={setEdited}
        fileName={fileName}
        onFileNameChange={setFileName}
      />
    </Drawer>
  );
}
