import { TableHead, TableHeaderCell } from "@/ui/kit/table";

/** What the third column says: the reason in the attention views, the stage in the portfolio. */
export type ThirdColumn = "reason" | "now";

// One column takes the width the others leave, and it is the one with the most to say: the
// reason where there is one, the shipment where the third column is only a stage.
const WIDTHS: Record<ThirdColumn, { shipment?: string; third?: string }> = {
  reason: { shipment: "w-76 min-[1440px]:w-92 2xl:w-104" },
  now: { third: "w-56" },
};

const THIRD: Record<ThirdColumn, string> = { reason: "Why it is here", now: "Now" };

/** The header of the shipments table, shared with its skeleton so that the two cannot drift. */
export function ColumnHeads({ third }: { third: ThirdColumn }) {
  return (
    <TableHead>
      <tr>
        <TableHeaderCell className="w-44">Status</TableHeaderCell>
        <TableHeaderCell className={WIDTHS[third].shipment}>Shipment</TableHeaderCell>
        <TableHeaderCell className={WIDTHS[third].third}>{THIRD[third]}</TableHeaderCell>
        <TableHeaderCell className="w-40">Delivery</TableHeaderCell>
        {/* Wide enough for "Message" and an operator's name, so the columns hold still. */}
        <TableHeaderCell className="w-59">Next step</TableHeaderCell>
        <TableHeaderCell className="w-24 text-right">Updated</TableHeaderCell>
      </tr>
    </TableHead>
  );
}
