"use client";

import { Button } from "@/ui/kit/button";
import { Card } from "@/ui/kit/card";
import { EmptyState } from "@/ui/kit/empty-state";

/** A failed read says so and offers the one thing that can help: asking again. */
export function PortalLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        title="We couldn't load this page."
        action={<Button onClick={onRetry}>Try again</Button>}
        className="px-2 py-4"
      />
    </Card>
  );
}
