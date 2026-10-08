import { clsx } from "clsx";
import { Stroke } from "@/ui/kit/stroke";

type WordmarkProps = {
  className?: string;
};

/**
 * The product's signature is its own line language: what happened is solid, what an
 * operator declared is dashed, what the model says is dotted.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden="true" className="flex items-center gap-1">
        <Stroke kind="confirmed" className="w-3" />
        <Stroke kind="declared" className="w-4" />
        <Stroke kind="estimated" className="w-3.5" />
      </span>
      <span className="text-base font-semibold">Estela</span>
    </span>
  );
}
