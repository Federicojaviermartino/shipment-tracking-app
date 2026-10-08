import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";
import { Table, TableActionCell, TableCell } from "@/ui/kit/table";
import { ColumnHeads, type ThirdColumn } from "./column-heads";

const ROWS = 6;

/** The table while its rows load: the same header and the same two lines per cell. */
export function TableSkeleton({ third }: { third: ThirdColumn }) {
  return (
    <SkeletonGroup label="Loading shipments…">
      <Table caption="Loading shipments">
        <ColumnHeads third={third} />
        <tbody>
          {Array.from({ length: ROWS }, (_, index) => (
            <tr key={index} className="h-16">
              <TableCell>
                <Skeleton pill className="h-5 w-20" />
                <Skeleton className="mt-2 h-3 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="mt-0.5 h-4 w-64" />
                <Skeleton className="mt-2 h-3 w-72" />
              </TableCell>
              <TableCell>
                <Skeleton className="mt-0.5 h-4 w-full max-w-md" />
                <Skeleton className="mt-2 h-3 w-1/2 max-w-56" />
              </TableCell>
              <TableCell>
                <Skeleton className="mt-0.5 h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-28" />
              </TableCell>
              <TableActionCell>
                <Skeleton className="h-7 w-28" />
              </TableActionCell>
              <TableCell>
                <Skeleton className="mt-1 ml-auto h-3 w-12" />
              </TableCell>
            </tr>
          ))}
        </tbody>
      </Table>
    </SkeletonGroup>
  );
}
