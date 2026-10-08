import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";

/** What is prerendered for a role layout: the frame, before the browser has the data. */
export function WorkspaceSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="h-topbar border-b border-line bg-surface" />
      <SkeletonGroup
        label="Loading Estela"
        className="mx-auto flex max-w-[100rem] flex-col gap-4 px-8 pt-6"
      >
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </SkeletonGroup>
    </div>
  );
}
