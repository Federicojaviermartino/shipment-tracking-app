import Link from "next/link";
import type { OpsRow } from "@/application/views";
import { buttonStyles } from "@/ui/kit/button-styles";
import { Card } from "@/ui/kit/card";

type AnswerCardProps = {
  row: OpsRow;
  /** Where the shipment stands, composed from its record: it carries no AI mark. */
  statusLine: string;
};

/** The answer to a question about one shipment: which one it is and where it stands. */
export function AnswerCard({ row, statusLine }: AnswerCardProps) {
  return (
    <Card as="section" aria-labelledby="answer-reference" className="flex items-start gap-6">
      <div className="min-w-0 flex-1">
        <h2 id="answer-reference" className="text-sm">
          <span className="font-mono font-medium">{row.id}</span>
          <span className="text-ink-600">
            {" "}
            · Order {row.orderRef} · {row.account.name}
          </span>
        </h2>
        <p className="mt-1 max-w-4xl text-base">{statusLine}</p>
      </div>
      <Link href={`/ops/shipments/${row.id}`} className={buttonStyles({ size: "sm" })}>
        Open shipment
      </Link>
    </Card>
  );
}
