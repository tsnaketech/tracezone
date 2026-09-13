import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOTSTRAP_FAILURE_TTL_MS,
  BOOTSTRAP_TIMEOUT_MS,
  BOOTSTRAP_TTL_MS,
  FUNCTION_MAX_DURATION_S,
  LOOKUP_DEADLINE_MS,
  RDAP_TIMEOUT_MS,
} from '@/lib/config';
import { createDeadline, unlimitedDeadline } from '@/lib/net/deadline';

describe('budget ordering', () => {
  // These are the invariants that keep a slow registry from turning into an
  // opaque platform timeout. If one of them breaks, the failure mode is a raw
  // FUNCTION_INVOCATION_TIMEOUT page instead of a clean UPSTREAM_TIMEOUT body.
  it('leaves the lookup enough headroom inside the function limit', () => {
    expect(LOOKUP_DEADLINE_MS).toBeLessThan(FUNCTION_MAX_DURATION_S * 1000);
    // At least a second of slack for cold start, serialisation and the response.
    expect(FUNCTION_MAX_DURATION_S * 1000 - LOOKUP_DEADLINE_MS).toBeGreaterThanOrEqual(1000);
  });

  it('keeps a single upstream request smaller than the whole lookup', () => {
    expect(RDAP_TIMEOUT_MS).toBeLessThan(LOOKUP_DEADLINE_MS);
    expect(BOOTSTRAP_TIMEOUT_MS).toBeLessThan(LOOKUP_DEADLINE_MS);
  });

  it('forgets a bootstrap failure far sooner than a success', () => {
    expect(BOOTSTRAP_FAILURE_TTL_MS).toBeLessThan(BOOTSTRAP_TTL_MS);
  });
});

describe('createDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the time left and expires once spent', () => {
    const deadline = createDeadline(1_000);
    expect(deadline.remaining()).toBe(1_000);
    expect(deadline.expired()).toBe(false);

    vi.advanceTimersByTime(400);
    expect(deadline.remaining()).toBe(600);

    vi.advanceTimersByTime(600);
    expect(deadline.remaining()).toBe(0);
    expect(deadline.expired()).toBe(true);
  });

  it('never reports a negative remaining budget', () => {
    const deadline = createDeadline(100);
    vi.advanceTimersByTime(10_000);
    expect(deadline.remaining()).toBe(0);
    expect(deadline.budget(5_000)).toBe(0);
  });

  it('hands a request the smaller of its own timeout and what is left', () => {
    const deadline = createDeadline(1_000);
    // Plenty of budget: the request keeps its own timeout.
    expect(deadline.budget(500)).toBe(500);

    vi.advanceTimersByTime(800);
    // Budget is nearly gone: the request is clamped to it.
    expect(deadline.budget(500)).toBe(200);
  });

  it('treats a zero or negative request timeout as zero', () => {
    const deadline = createDeadline(1_000);
    expect(deadline.budget(0)).toBe(0);
    expect(deadline.budget(-5)).toBe(0);
  });

  it('clamps a negative total to an already-expired deadline', () => {
    expect(createDeadline(-1).expired()).toBe(true);
  });
});

describe('unlimitedDeadline', () => {
  it('never expires and never clamps a request', () => {
    const deadline = unlimitedDeadline();
    expect(deadline.expired()).toBe(false);
    expect(deadline.budget(RDAP_TIMEOUT_MS)).toBe(RDAP_TIMEOUT_MS);
  });
});
