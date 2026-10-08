import { compareText } from "./compare";
import { HEALTH_RANK, type ShipmentException } from "./exceptions";
import type { LocalDate } from "./time";

/**
 * A shipment has one row in the queue. Its primary exception is the worst one that still needs
 * action; when nothing needs action any more, the worst one it is waiting on.
 */
export function primaryException(
  exceptions: readonly ShipmentException[],
): ShipmentException | null {
  const byHealth = [...exceptions].sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health]);
  return byHealth.find((exception) => exception.state === "needs_action") ?? byHealth[0] ?? null;
}

export type QueueRow = { committedDate: LocalDate; exception: ShipmentException };

/**
 * Queue order: the nearest clock first (no clock last), then the worse health, then the earlier
 * committed date. The row prints its clock, so the order explains itself.
 */
export function compareQueueRows(a: QueueRow, b: QueueRow): number {
  const clockA = a.exception.actBy?.at;
  const clockB = b.exception.actBy?.at;
  if (clockA !== clockB) {
    if (clockA === undefined) return 1;
    if (clockB === undefined) return -1;
    return clockA - clockB;
  }
  return (
    HEALTH_RANK[a.exception.health] - HEALTH_RANK[b.exception.health] ||
    compareText(a.committedDate, b.committedDate) ||
    compareText(a.exception.id, b.exception.id)
  );
}
