import type { EstelaView } from "@/application/views";
import { dateValue } from "@/ui/format/when";
import { DateStamp } from "@/ui/kit/date-stamp";
import { ProvenanceMark } from "@/ui/kit/provenance-mark";

type EstimateChainProps = {
  estimate: Extract<EstelaView, { kind: "estimate" }>;
};

/**
 * Why Estela says what it says: the steps from here to the door, each with where its time
 * comes from. The mark on a row is that of the time printed on it: an operator's own
 * estimate stays the operator's, everything derived from it is Estela's.
 */
export function EstimateChain({ estimate }: EstimateChainProps) {
  return (
    <>
      <ol className="flex flex-col gap-2">
        {estimate.steps.map((step) => {
          const kind = step.from === "operator_estimate" ? "declared" : "estimated";
          return (
            <li
              key={step.milestoneKey}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2"
            >
              <span className="flex h-5 items-center">
                <ProvenanceMark kind={kind} />
              </span>
              <span>{step.label}</span>
              <DateStamp kind={kind} {...dateValue(step.when)} mark={false} words="none" />
              <p className="col-span-2 col-start-2 text-xs text-ink-600 first-letter:uppercase">
                {step.fromLabel}
              </p>
            </li>
          );
        })}
      </ol>
      {estimate.firmsUp && <p className="mt-3 text-xs text-ink-600">{estimate.firmsUp}</p>}
      {estimate.assumption && <p className="mt-1 text-xs text-ink-600">{estimate.assumption}</p>}
    </>
  );
}
