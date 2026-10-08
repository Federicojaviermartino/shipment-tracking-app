import type { DatesView } from "@/application/views";
import { dayValue, lateBy } from "@/ui/format/when";
import { DateStamp } from "@/ui/kit/date-stamp";
import { Delta } from "@/ui/kit/delta";
import { TableCell } from "@/ui/kit/table";

// A row has room for one date besides the committed one. When Estela's estimate contradicts an
// operator estimate that still stands, the later of the two is the one a desk has to see.
function rowDate({ best, estela }: DatesView) {
  if (
    estela?.kind === "estimate" &&
    !estela.agreesWithOperator &&
    estela.lateBy > (best?.lateBy ?? 0)
  ) {
    return { day: estela.day, provenance: "estimated" as const, by: null, lateBy: estela.lateBy };
  }
  return best;
}

/** The committed day and, under it, the date that matters with its distance to the first. */
export function DeliveryCell({ dates }: { dates: DatesView }) {
  const best = rowDate(dates);
  const difference = best ? lateBy(best.lateBy) : null;

  return (
    <TableCell>
      <DateStamp kind="committed" {...dayValue(dates.committed)} words="hidden" />
      {best ? (
        <p className="flex items-center gap-2 whitespace-nowrap">
          <DateStamp
            kind={best.provenance}
            {...dayValue(best.day)}
            detail={best.by ?? undefined}
            words="hidden"
          />
          {difference && <Delta>{difference}</Delta>}
        </p>
      ) : (
        <p className="line-clamp-1 text-xs/5 text-ink-600" title={dates.bestMissing ?? undefined}>
          {dates.bestMissing}
        </p>
      )}
    </TableCell>
  );
}
