import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_FAILURE_TTL_MS, BOOTSTRAP_TTL_MS } from '@/lib/config';
import { createDeadline } from '@/lib/net/deadline';
import type * as SafeFetchModule from '@/lib/net/safe-fetch';

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/net/safe-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof SafeFetchModule>();
  return { ...actual, safeFetch };
});

const { getBootstrap, resetBootstrapCache } = await import('@/lib/rdap/bootstrap');

const REGISTRY = {
  services: [[['com'], ['https://rdap.verisign.com/com/v1']]],
};

function respondOk() {
  safeFetch.mockResolvedValue({
    status: 200,
    ok: true,
    url: 'https://data.iana.org/rdap/dns.json',
    contentType: 'application/json',
    body: JSON.stringify(REGISTRY),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetBootstrapCache();
  safeFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bootstrap caching', () => {
  it('fetches once and reuses the registry', async () => {
    respondOk();

    expect((await getBootstrap()).get('com')).toEqual(['https://rdap.verisign.com/com/v1/']);
    await getBootstrap();
    await getBootstrap();

    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches once the success TTL has elapsed', async () => {
    respondOk();
    await getBootstrap();

    vi.advanceTimersByTime(BOOTSTRAP_TTL_MS + 1);
    await getBootstrap();

    expect(safeFetch).toHaveBeenCalledTimes(2);
  });
});

describe('bootstrap failure caching', () => {
  it('does not re-pay the timeout on every lookup while IANA is down', async () => {
    // Without a negative cache this is the expensive path: each call, and each
    // candidate within a lookup, would wait on the registry all over again.
    safeFetch.mockRejectedValue(new Error('unreachable'));

    expect((await getBootstrap()).size).toBe(0);
    expect((await getBootstrap()).size).toBe(0);
    expect((await getBootstrap()).size).toBe(0);

    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('retries once the short failure TTL has elapsed', async () => {
    safeFetch.mockRejectedValue(new Error('unreachable'));
    await getBootstrap();
    expect(safeFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(BOOTSTRAP_FAILURE_TTL_MS + 1);
    respondOk();
    expect((await getBootstrap()).get('com')).toBeDefined();
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps serving a stale registry rather than losing it to one failure', async () => {
    respondOk();
    await getBootstrap();

    vi.advanceTimersByTime(BOOTSTRAP_TTL_MS + 1);
    safeFetch.mockRejectedValue(new Error('unreachable'));

    const map = await getBootstrap();
    expect(map.get('com')).toEqual(['https://rdap.verisign.com/com/v1/']);
  });

  it('treats a non-200 registry response as a failure', async () => {
    safeFetch.mockResolvedValue({
      status: 503,
      ok: false,
      url: 'https://data.iana.org/rdap/dns.json',
      contentType: null,
      body: '',
    });

    expect((await getBootstrap()).size).toBe(0);
    await getBootstrap();
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
});

describe('bootstrap under a deadline', () => {
  it('skips the registry entirely when there is no budget left for it', async () => {
    respondOk();
    const spent = createDeadline(0);

    expect((await getBootstrap(spent)).size).toBe(0);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
