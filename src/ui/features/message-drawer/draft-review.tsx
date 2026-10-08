"use client";

import type { Draft } from "@/application/views";
import { Disclosure, DisclosureContent, DisclosureTrigger } from "@/ui/kit/disclosure";
import type { MessageText } from "./approval";
import { AttachmentRow } from "./attachment-row";
import { FactList } from "./fact-list";
import { MessageFields } from "./message-fields";

type DraftReviewProps = {
  draft: Draft;
  text: MessageText;
  onTextChange: (text: MessageText) => void;
  fileName: string | null;
  onFileNameChange: (fileName: string) => void;
};

/** The body of the drawer: the message, what goes with it and the facts it may rest on. */
export function DraftReview({
  draft,
  text,
  onTextChange,
  fileName,
  onFileNameChange,
}: DraftReviewProps) {
  const used = draft.facts.filter((fact) => fact.used);
  const others = draft.facts.filter((fact) => !fact.used);
  // Without a draft no fact was used: the whole sheet is what the writer starts from.
  const listed = draft.writtenByAi ? used : draft.facts;

  return (
    <div className="flex flex-col gap-6 text-sm">
      <MessageFields draft={draft} text={text} onChange={onTextChange} />

      {draft.attachment && (
        <AttachmentRow
          attachment={draft.attachment}
          fileName={fileName}
          onChange={onFileNameChange}
        />
      )}

      <section>
        <h3 className="text-label">{draft.writtenByAi ? "Facts used" : "Facts in the record"}</h3>
        <div className="mt-2">
          <FactList facts={listed} />
        </div>
        {draft.writtenByAi && others.length > 0 && (
          <Disclosure className="mt-1">
            <DisclosureTrigger openLabel="Hide the other facts">
              {others.length} more in the record
            </DisclosureTrigger>
            <DisclosureContent>
              <FactList facts={others} />
            </DisclosureContent>
          </Disclosure>
        )}
      </section>
    </div>
  );
}
