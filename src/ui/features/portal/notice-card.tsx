import { clsx } from "clsx";
import Link from "next/link";
import type { PortalNoticeView } from "@/application/views";
import { type Instant, MINUTE } from "@/domain/time";
import { dateValue } from "@/ui/format/when";
import { buttonStyles } from "@/ui/kit/button-styles";
import { Card } from "@/ui/kit/card";
import { DateText } from "@/ui/kit/date-stamp";
import { StatusPill } from "@/ui/kit/status-pill";
import { Tag } from "@/ui/kit/tag";
import { DESK } from "./desk";
import { shipmentHref } from "./links";
import { VERDICT_STATUS } from "./verdict-status";

const NEW_FOR = 10 * MINUTE;

type NoticeCardProps = {
  notice: PortalNoticeView;
  /** The verdict of its shipment in the customer's words: what the status bar repeats. */
  verdictLabel?: string;
  now: Instant;
  /** On the list a notice shows the start of its text and leads to its shipment. */
  preview?: boolean;
};

/** Something a named person at the desk told the customer: always signed, never anonymous. */
export function NoticeCard({ notice, verdictLabel, now, preview = false }: NoticeCardProps) {
  const status = VERDICT_STATUS[notice.verdict];
  const isNew = now - notice.at < NEW_FOR;

  return (
    <Card
      as="article"
      variant="flagged"
      status={status}
      density="customer"
      className="text-base max-sm:p-4"
    >
      {(verdictLabel || isNew) && (
        <div className="mb-2 flex items-center gap-2">
          {verdictLabel && (
            <StatusPill status={status} size="md">
              {verdictLabel}
            </StatusPill>
          )}
          {isNew && <Tag tone="brand">New</Tag>}
        </div>
      )}
      <h2 className="font-semibold">{notice.subject}</h2>
      <p className={clsx("mt-1 whitespace-pre-line text-ink-700", preview && "line-clamp-3")}>
        {notice.body}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="text-sm text-ink-600">
          Approved by {notice.approvedBy}, {DESK.name} ·{" "}
          <DateText {...dateValue({ at: notice.at, precision: "minute", zone: DESK.zone })} />{" "}
          {DESK.place}
        </p>
        {preview && (
          <Link href={shipmentHref(notice.shipmentId)} className={buttonStyles({ size: "lg" })}>
            See shipment<span className="sr-only">, order {notice.orderRef}</span>
          </Link>
        )}
      </div>
    </Card>
  );
}
