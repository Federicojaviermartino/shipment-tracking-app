import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";

/** Stands in for either portal page while its one query is on the way. */
export function PortalSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="mt-4 h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </SkeletonGroup>
  );
}
