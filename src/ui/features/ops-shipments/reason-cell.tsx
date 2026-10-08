import { clsx } from "clsx";
import type { CaseView } from "@/application/views";
import { aiWords } from "@/ui/kit/ai-words";
import { TableCell } from "@/ui/kit/table";
import { EvidenceMark } from "./evidence-mark";

/**
 * Why a shipment is in the queue. The mark has a column of its own, so that the reasons of every
 * row share one text edge. A reason gives up its second line to what the reader must know next:
 * that it rests on a reading nobody has confirmed, or that the case waits on someone else.
 */
export function ReasonCell({ case: open }: { case: CaseView }) {
  const notes = [
    open.needsConfirmation ? aiWords({ kind: "reading" }).tag : null,
    open.waiting,
  ].filter((note) => note !== null);

  return (
    <TableCell>
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
        <span className="flex h-5 items-center">
          <EvidenceMark case={open} />
        </span>
        <div>
          <p className={clsx(notes.length > 0 ? "line-clamp-1" : "line-clamp-2")} title={open.why}>
            {open.why}
          </p>
          {notes.length > 0 && (
            <p className="line-clamp-1 text-xs/5 text-ink-600">{notes.join(" · ")}</p>
          )}
        </div>
      </div>
    </TableCell>
  );
}
