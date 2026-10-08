"use client";

import type { ReadingView, StepView } from "@/application/views";
import type { ShipmentId } from "@/domain/shipment";
import { StepAction } from "@/ui/features/message-drawer/step-action";
import { dateValue } from "@/ui/format/when";
import { DateText } from "@/ui/kit/date-stamp";
import { DESK_PLACE, deskTime } from "./desk";
import { ReadingBlock } from "./reading-block";

const NOTE = "text-xs text-ink-600";

function Performed({ words, done }: { words: string; done: NonNullable<StepView["done"]> }) {
  return (
    <>
      {words} · {done.by} · <DateText {...dateValue(deskTime(done.at))} /> {DESK_PLACE}
    </>
  );
}

type CaseStepProps = {
  shipmentId: ShipmentId;
  number: number;
  step: StepView;
  /** The next thing to do in its panel. */
  primary: boolean;
  /** The reading this step asks a person to review. */
  reading: ReadingView | null;
};

/** One proposed step: what to do, and either its button or who did it and when. */
export function CaseStep({ shipmentId, number, step, primary, reading }: CaseStepProps) {
  const done = step.state === "done";
  // A reading under review brings its own two buttons, next to the text they are about.
  const reviewing = reading?.state === "ai_pending";

  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-2 border-t border-line py-3">
      <span className="font-mono text-xs/5 text-ink-500 tabular-nums">{number}</span>
      <div className="min-w-0">
        <p>{step.label}</p>
        {!done && !step.allowed && step.disabledReason && (
          <p className={NOTE}>{step.disabledReason}</p>
        )}
        {step.state === "outdated" && step.done && (
          <p className={NOTE}>
            <Performed words="Out of date · last sent by" done={step.done} />
          </p>
        )}
        {reading && <ReadingBlock shipmentId={shipmentId} reading={reading} step={step} />}
      </div>
      {done && step.done ? (
        <p className="text-xs/5 whitespace-nowrap text-ink-600">
          <Performed words="Done" done={step.done} />
        </p>
      ) : (
        !reviewing && <StepAction shipmentId={shipmentId} step={step} primary={primary} />
      )}
    </li>
  );
}
