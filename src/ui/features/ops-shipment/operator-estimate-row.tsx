import type { DatesView } from "@/application/views";
import { dateValue, dayValue, lateBy } from "@/ui/format/when";
import { DateStamp, DateText } from "@/ui/kit/date-stamp";
import { Delta } from "@/ui/kit/delta";
import { DATE_NOTE, DATE_ROW, DateLabel } from "./date-row";
import { deskDay } from "./desk";

type OperatorEstimateRowProps = {
  dates: Pick<DatesView, "operator" | "withdrawn">;
};

/**
 * What the operator says about the door: its estimate, struck through once newer information
 * has overtaken it or the operator has taken it back. No estimate reads as none, never as a date.
 */
export function OperatorEstimateRow({ dates }: OperatorEstimateRowProps) {
  const { operator, withdrawn } = dates;

  if (operator) {
    const delta = operator.superseded ? null : lateBy(operator.lateBy);
    return (
      <div className={DATE_ROW}>
        <DateLabel kind="declared" muted={operator.superseded}>
          Operator estimate
        </DateLabel>
        <dd className="flex items-center gap-3">
          {delta && <Delta status={operator.lateBy > 0 ? "delayed" : undefined}>{delta}</Delta>}
          <DateStamp
            kind="declared"
            {...dateValue(operator.when)}
            superseded={operator.superseded}
            mark={false}
            words="none"
          />
        </dd>
        <dd className={DATE_NOTE}>
          {operator.by} ·{" "}
          {operator.supersededNote ?? (
            <>
              declared <DateText {...dateValue(deskDay(operator.declaredAt))} />
            </>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className={DATE_ROW}>
      <DateLabel kind="declared" muted>
        Operator estimate
      </DateLabel>
      {withdrawn ? (
        <>
          <dd>
            <DateStamp
              kind="declared"
              {...dayValue(withdrawn.day)}
              superseded
              mark={false}
              words="none"
            />
          </dd>
          <dd className={DATE_NOTE}>{withdrawn.line}</dd>
        </>
      ) : (
        <dd className="text-ink-600">No estimate yet</dd>
      )}
    </div>
  );
}
