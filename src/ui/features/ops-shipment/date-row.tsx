import type { ReactNode } from "react";
import type { ProvenanceKind } from "@/ui/kit/provenance";
import { ProvenanceMark } from "@/ui/kit/provenance-mark";

/** One labelled date of the Delivery block: label left, date right, a note under both. */
export const DATE_ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line py-3 first:border-t-0 first:pt-0";

// Indented by the glyph and its gap, so the note starts under the label.
export const DATE_NOTE = "col-span-2 pl-[1.125rem] text-xs text-ink-600";

type DateLabelProps = {
  kind: ProvenanceKind;
  /** The value no longer stands, or there is none: the mark steps back. */
  muted?: boolean;
  children: ReactNode;
};

export function DateLabel({ kind, muted, children }: DateLabelProps) {
  return (
    <dt className="flex h-5 items-center gap-1.5 text-ink-600">
      <ProvenanceMark kind={kind} words="none" muted={muted} />
      {children}
    </dt>
  );
}
