import { Suspense } from "react";
import { OpsFrame } from "@/ui/shell/ops-frame";
import { Workspace } from "@/ui/shell/workspace";
import { WorkspaceSkeleton } from "@/ui/shell/workspace-skeleton";

export default function OpsLayout({ children }: LayoutProps<"/ops">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace side="operations">
        <OpsFrame>{children}</OpsFrame>
      </Workspace>
    </Suspense>
  );
}
