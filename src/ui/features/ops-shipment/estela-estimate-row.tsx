"use client";

import { clsx } from "clsx";
import type { EstelaView } from "@/application/views";
import { dayValue, lateBy } from "@/ui/format/when";
import { DateStamp, DateText } from "@/ui/kit/date-stamp";
import { Delta } from "@/ui/kit/delta";
import { Disclosure, DisclosureContent, DisclosureTrigger } from "@/ui/kit/disclosure";
import { DATE_NOTE, DATE_ROW, DateLabel } from "./date-row";
import { EstimateChain } from "./estimate-chain";

/**
 * What the model says about the door, with the chain behind it one click away. A withheld
 * estimate prints its reason where the date would be; one that matches the operator's says so
 * instead of repeating the date.
 */
export function EstelaEstimateRow({ estela }: { estela: EstelaView }) {
  if (estela.kind === "withheld") {
    return (
      <div className={DATE_ROW}>
        <DateLabel kind="estimated" muted>
          Estela estimate
        </DateLabel>
        <dd className="col-span-2 mt-0.5 pl-[1.125rem]">{estela.line}</dd>
      </div>
    );
  }

  const { window } = estela;
  const delta = lateBy(estela.lateBy);

  return (
    <Disclosure asChild>
      <div className={DATE_ROW}>
        <DateLabel kind="estimated">Estela estimate</DateLabel>
        {estela.agreesWithOperator ? (
          <dd className="text-ink-600">Agrees with the operator</dd>
        ) : (
          <dd className="flex items-center gap-3">
            {delta && <Delta status={estela.lateBy > 0 ? "at_risk" : undefined}>{delta}</Delta>}
            <DateStamp kind="estimated" {...dayValue(estela.day)} mark={false} words="none" />
          </dd>
        )}
        <dd className={clsx(DATE_NOTE, "flex items-center justify-between gap-3")}>
          <span>
            {window.earliest !== window.latest && (
              <span className="block">
                Window <DateText {...dayValue(window.earliest)} /> –{" "}
                <DateText {...dayValue(window.latest)} />
              </span>
            )}
            {estela.basis}
          </span>
          <DisclosureTrigger className="-my-1.5 shrink-0">Why?</DisclosureTrigger>
        </dd>
        <DisclosureContent asChild>
          <dd className="col-span-2 mt-2 rounded-sm bg-canvas p-3">
            <EstimateChain estimate={estela} />
          </dd>
        </DisclosureContent>
      </div>
    </Disclosure>
  );
}
