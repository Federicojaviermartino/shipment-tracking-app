"use client";

import { clsx } from "clsx";
import { Paperclip } from "lucide-react";
import type { Draft } from "@/application/views";
import { Button } from "@/ui/kit/button";
import { buttonStyles } from "@/ui/kit/button-styles";

type AttachmentRowProps = {
  attachment: NonNullable<Draft["attachment"]>;
  fileName: string | null;
  onChange: (fileName: string) => void;
};

/**
 * The document that goes with the message. Only the name of the file is kept: the prototype
 * sends nothing, so the sample file stands in for a real one.
 */
export function AttachmentRow({ attachment, fileName, onChange }: AttachmentRowProps) {
  return (
    <section>
      <h3 className="text-label">Attachment</h3>
      <p className="mt-2 flex items-center gap-2">
        <Paperclip aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
        <span>{attachment.label}</span>
        {fileName ? (
          <span className="min-w-0 truncate font-mono text-xs">{fileName}</span>
        ) : (
          <span className="text-ink-600">No file attached yet</span>
        )}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <label
          className={clsx(buttonStyles({ size: "sm" }), "has-[input:focus-visible]:focus-outline")}
        >
          Choose a file
          <input
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onChange(file.name);
            }}
          />
        </label>
        <Button size="sm" onClick={() => onChange(attachment.suggestedFileName)}>
          Use the sample file
        </Button>
      </div>
    </section>
  );
}
