/**
 * A wall-clock budget shared across several sequential requests.
 *
 * Per-request timeouts alone are not enough: a lookup can make up to three
 * upstream calls, so bounding each one still leaves the total unbounded. Every
 * call in a lookup draws from the same {@link Deadline}, which is what keeps the
 * whole operation inside the serverless function's own time limit — and lets us
 * answer with a clean `UPSTREAM_TIMEOUT` instead of being killed mid-flight and
 * handing the caller a platform error page.
 */

export interface Deadline {
  /** Epoch milliseconds at which the budget is exhausted. */
  readonly at: number;
  /** Milliseconds left. Never negative. */
  remaining(): number;
  expired(): boolean;
  /**
   * What to hand a single request: the smaller of its own timeout and whatever
   * is left of the shared budget.
   */
  budget(requestTimeoutMs: number): number;
}

export function createDeadline(totalMs: number, now: number = Date.now()): Deadline {
  const at = now + Math.max(totalMs, 0);
  const remaining = () => Math.max(at - Date.now(), 0);

  return {
    at,
    remaining,
    expired: () => remaining() === 0,
    budget: (requestTimeoutMs: number) => Math.min(Math.max(requestTimeoutMs, 0), remaining()),
  };
}

/** A deadline that never expires. For callers that impose no budget. */
export function unlimitedDeadline(): Deadline {
  return {
    at: Number.POSITIVE_INFINITY,
    remaining: () => Number.POSITIVE_INFINITY,
    expired: () => false,
    budget: (requestTimeoutMs: number) => Math.max(requestTimeoutMs, 0),
  };
}
