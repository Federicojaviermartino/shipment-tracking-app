import { Suspense } from "react";
import { PortalFrame } from "@/ui/shell/portal-frame";
import { Workspace } from "@/ui/shell/workspace";
import { WorkspaceSkeleton } from "@/ui/shell/workspace-skeleton";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace side="customer">
        <PortalFrame>{children}</PortalFrame>
      </Workspace>
    </Suspense>
  );
}
