import type { Clock } from "@/application/ports/clock";
import type { Instant } from "@/domain/time";

/** A clock a test moves by hand. */
export class ManualClock implements Clock {
  constructor(private at: Instant) {}

  now(): Instant {
    return this.at;
  }

  advance(ms: number): void {
    this.at += ms;
  }
}

/**
 * The demo world is frozen at T0 and then runs in real time: `now` is T0 plus whatever has
 * passed since the session started. The start is read on every call, because a reset in any tab
 * starts a new session for all of them.
 */
export class DemoClock implements Clock {
  constructor(
    private readonly t0: Instant,
    private readonly sessionStartedAt: () => number,
    private readonly wallClock: () => number = Date.now,
  ) {}

  now(): Instant {
    return this.t0 + Math.max(0, this.wallClock() - this.sessionStartedAt());
  }
}
