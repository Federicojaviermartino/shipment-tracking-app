import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";

const READING = "Reading the shipment record…";

/** The draft while the assistant writes it: the shape of the two fields and of the fact sheet. */
export function DraftSkeleton() {
  return (
    <SkeletonGroup label={READING}>
      <p className="text-sm text-ink-600">{READING}</p>
      <Skeleton className="mt-4 h-3 w-16" />
      <Skeleton className="mt-2 h-8 w-full" />
      <Skeleton className="mt-4 h-3 w-16" />
      <Skeleton className="mt-2 h-48 w-full" />
      <Skeleton className="mt-8 h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-full" />
      <Skeleton className="mt-2 h-9 w-full" />
      <Skeleton className="mt-2 h-9 w-3/4" />
    </SkeletonGroup>
  );
}
