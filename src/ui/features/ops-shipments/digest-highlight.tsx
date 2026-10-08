"use client";

import { useQuery } from "@tanstack/react-query";
import { opsQueries } from "@/ui/hooks/queries";
import { AiBlock } from "@/ui/kit/ai-block";
import { Skeleton, SkeletonGroup } from "@/ui/kit/skeleton";
import { useOpsSession } from "@/ui/shell/session";

/**
 * The one generated sentence of the briefing. It is asked for apart from the counts, which never
 * wait on a model, and it is an extra: with nothing to say, or when the writer fails, the
 * briefing stands without it.
 */
export function DigestHighlight() {
  const { estela, actor } = useOpsSession();
  const highlight = useQuery(opsQueries.highlight(estela, actor));

  if (highlight.isPending) {
    // The block's own geometry (tag, two lines of prose, footer), so that nothing moves when
    // the sentence arrives.
    return (
      <SkeletonGroup label="Writing the briefing…" className="max-w-4xl pl-4">
        <Skeleton className="mt-0.5 h-4 w-8" />
        <Skeleton className="mt-2.5 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <Skeleton className="mt-3.5 mb-0.5 h-3 w-64" />
      </SkeletonGroup>
    );
  }
  if (!highlight.data) {
    return null;
  }
  return (
    <AiBlock footer={highlight.data.caption} className="max-w-4xl">
      {highlight.data.text}
    </AiBlock>
  );
}
