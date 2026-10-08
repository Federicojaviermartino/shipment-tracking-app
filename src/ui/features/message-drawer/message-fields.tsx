"use client";

import type { Draft } from "@/application/views";
import { AiBlock } from "@/ui/kit/ai-block";
import { Field, TextArea, TextInput } from "@/ui/kit/field";
import { InlineMessage } from "@/ui/kit/inline-message";
import { type MessageText, strayDates } from "./approval";

type MessageFieldsProps = {
  draft: Draft;
  text: MessageText;
  onChange: (text: MessageText) => void;
};

/**
 * The subject and the body, editable. What the model wrote sits behind its mark until a person
 * changes it; when the model wrote nothing there is no mark, only the empty fields.
 */
export function MessageFields({ draft, text, onChange }: MessageFieldsProps) {
  const fields = (
    <>
      <Field label="Subject" error={strayDates(text.subject, draft)}>
        <TextInput
          // The draft arrives after the drawer has opened: this is where the review starts.
          autoFocus
          value={text.subject}
          onChange={(event) => onChange({ ...text, subject: event.target.value })}
        />
      </Field>
      <Field label="Message" className="mt-3" error={strayDates(text.body, draft)}>
        <TextArea
          rows={9}
          value={text.body}
          onChange={(event) => onChange({ ...text, body: event.target.value })}
        />
      </Field>
    </>
  );

  if (!draft.writtenByAi) {
    return (
      <div>
        <InlineMessage>
          The assistant couldn&apos;t write a draft. Start from the facts below.
        </InlineMessage>
        <div className="mt-4">{fields}</div>
      </div>
    );
  }

  const used = draft.facts.filter((fact) => fact.used).length;
  const edited = text.subject !== draft.subject || text.body !== draft.body;

  return (
    <AiBlock
      density="compact"
      state={{ kind: "draft", edited }}
      footer={`Drafted by AI from ${used} ${used === 1 ? "fact" : "facts"}. Nothing is sent until you approve.`}
    >
      <div className="mt-2">{fields}</div>
    </AiBlock>
  );
}
