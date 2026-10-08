import { clsx } from "clsx";
import { AiMark } from "@/ui/kit/ai-mark";
import { buttonStyles } from "@/ui/kit/button-styles";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/ui/kit/popover";
import { type ProvenanceKind, provenanceWords } from "@/ui/kit/provenance";
import { ProvenanceMark } from "@/ui/kit/provenance-mark";
import { Stroke } from "@/ui/kit/stroke";

/** What the legend says, as a heading for wherever its table is shown. */
export const LEGEND_TITLE = "Every date says where it came from";

const MEANING: Record<ProvenanceKind, string> = {
  confirmed: "An operator reported that it happened.",
  declared: "An operator declared when it will happen.",
  estimated: "Estela computed it from the latest facts. Always a day with a window.",
  planned: "Taken from the booking plan. Nobody has asserted it.",
  committed: "The delivery day promised to the customer.",
};

const KINDS = Object.keys(MEANING) as ProvenanceKind[];

type LegendTableProps = {
  className?: string;
};

/** The six marks that every date and every generated text carries, in both roles. */
export function LegendTable({ className }: LegendTableProps) {
  return (
    <table className={clsx("w-full border-collapse text-left text-sm", className)}>
      <caption className="sr-only">Where a date or a text comes from</caption>
      <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-line">
        {KINDS.map((kind) => (
          <tr key={kind}>
            <td className="w-14 py-2 pr-3">
              <span className="flex items-center gap-1.5">
                <ProvenanceMark kind={kind} words="none" />
                {kind !== "committed" && <Stroke kind={kind} className="w-6" />}
              </span>
            </td>
            <th scope="row" className="py-2 pr-4 font-medium whitespace-nowrap">
              {provenanceWords(kind, "ops").label}
            </th>
            <td className="py-2 text-ink-600">{MEANING[kind]}</td>
          </tr>
        ))}
        <tr>
          <td className="py-2 pr-3">
            <AiMark />
          </td>
          <th scope="row" className="py-2 pr-4 font-medium whitespace-nowrap">
            Written by AI
          </th>
          <td className="py-2 text-ink-600">
            Text a model wrote. A named person approves it before it leaves Estela.
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** The legend behind a button in the top bar. */
export function Legend() {
  return (
    <Popover>
      <PopoverTrigger className={buttonStyles({ variant: "ghost" })}>
        <span aria-hidden="true" className="flex items-center gap-0.5">
          <ProvenanceMark kind="confirmed" words="none" />
          <ProvenanceMark kind="declared" words="none" />
          <ProvenanceMark kind="estimated" words="none" />
        </span>
        Legend
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[30rem] max-w-[calc(100vw-2rem)]">
        <PopoverTitle className="mb-1">{LEGEND_TITLE}</PopoverTitle>
        <LegendTable />
      </PopoverContent>
    </Popover>
  );
}
