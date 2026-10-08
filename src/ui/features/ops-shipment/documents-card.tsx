import { useId } from "react";
import type { DocumentView } from "@/application/views";
import { AlertGlyph } from "@/ui/kit/alert-glyph";
import { Card } from "@/ui/kit/card";

// Ink only: a missing paper is something to fix, not a degree of lateness.
const STATUS_TONE: Record<DocumentView["status"], string> = {
  on_file: "text-ink-600",
  sent: "text-ink-900",
  pending: "text-ink-900",
  missing: "font-medium text-ink-900",
  not_yet_due: "text-ink-500",
};

/** The papers of the shipment and where each one stands. */
export function DocumentsCard({ documents }: { documents: readonly DocumentView[] }) {
  const titleId = useId();

  return (
    <Card as="section" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-lg font-semibold">
        Documents
      </h2>
      <ul className="mt-2">
        {documents.map((document) => (
          <li
            key={document.docType}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line py-2 first:border-t-0 last:pb-0"
          >
            <p>{document.label}</p>
            <p className={`flex items-center gap-1.5 ${STATUS_TONE[document.status]}`}>
              {document.status === "missing" && <AlertGlyph />}
              {document.statusLabel}
            </p>
            {document.fileName && (
              <p className="col-span-2 truncate font-mono text-xs text-ink-600">
                {document.fileName}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
