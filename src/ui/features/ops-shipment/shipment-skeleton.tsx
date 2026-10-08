import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";
import { LAYOUT, MAIN, RAIL } from "./layout";

const CARD = "rounded-md border border-line bg-surface p-4";

/** The page before its shipment arrives: the header, the strip, the two columns. */
export function ShipmentSkeleton() {
  return (
    <SkeletonGroup label="Loading the shipment">
      <Skeleton className="h-7 w-24" />
      <div className="mt-1 flex items-center gap-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-6 w-80" />
        <Skeleton pill className="h-6 w-24" />
      </div>
      <div className="mt-3 flex gap-8">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-72" />
      </div>
      <div className={`mt-4 ${CARD}`}>
        <Skeleton className="h-[5.5rem] w-full" />
      </div>
      <div className={LAYOUT}>
        <div className={MAIN}>
          <div className={CARD}>
            <Skeleton className="h-7 w-96" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-6 h-12 w-full" />
          </div>
          <div className={CARD}>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-2 h-11 w-2/3" />
          </div>
        </div>
        <div className={RAIL}>
          <div className={CARD}>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="mt-3 h-5 w-full" />
            <Skeleton className="mt-6 h-10 w-full" />
            <Skeleton className="mt-6 h-10 w-full" />
          </div>
          <div className={CARD}>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-3 h-24 w-full" />
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}
