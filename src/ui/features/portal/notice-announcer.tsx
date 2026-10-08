"use client";

import { useState } from "react";
import type { PortalNoticeView } from "@/application/views";

type Heard = {
  /** The notices on the page at the last look. */
  ids: readonly string[];
  arrived: PortalNoticeView | null;
};

type NoticeAnnouncerProps = {
  /** Newest first; `undefined` while the page is still loading. */
  notices: readonly PortalNoticeView[] | undefined;
};

/**
 * The portal never toasts: a notice that arrives while the page is open is announced politely
 * instead. What was already there when the page opened is not news, and the region is mounted
 * before any notice so that assistive technology is listening when one comes.
 */
export function NoticeAnnouncer({ notices }: NoticeAnnouncerProps) {
  const [heard, setHeard] = useState<Heard | null>(null);

  if (notices) {
    const ids = notices.map((notice) => notice.id);
    if (heard === null || ids.join() !== heard.ids.join()) {
      const arrived = heard && notices.find((notice) => !heard.ids.includes(notice.id));
      setHeard({ ids, arrived: arrived ?? null });
    }
  }

  return (
    <p role="status" className="sr-only">
      {heard?.arrived && <span key={heard.arrived.id}>New notice: {heard.arrived.subject}</span>}
    </p>
  );
}
