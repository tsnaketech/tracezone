import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeadline } from '@/lib/net/deadline';
import type * as RdapClientModule from '@/lib/rdap/client';
import type { RdapOutcome } from '@/lib/rdap/client';
import { exampleComRdap } from './fixtures/rdap-example-com';

const lookupRdapDomain = vi.hoisted(() =>
  vi.fn<(domain: string, deadline?: unknown) => Promise<RdapOutcome>>(),
);

vi.mock('@/lib/rdap/client', async (importOriginal) => {
  const actual = await importOriginal<typeof RdapClientModule>();
  return { ...actual, lookupRdapDomain };
});

const { lookupDomain } = await import('@/lib/lookup/domain');
const { ApiError } = await import('@/lib/api/errors');

const FOUND: RdapOutcome = {
  kind: 'found',
  url: 'https://rdap.verisign.com/com/v1/domain/example.com',
  via: 'iana-bootstrap',
  data: exampleComRdap,
};

const NOT_FOUND: RdapOutcome = {
  kind: 'not-found',
  url: 'https://rdap.verisign.com/com/v1/domain/nope.com',
  via: 'iana-bootstrap',
};

beforeEach(() => {
  lookupRdapDomain.mockReset();
});

describe('lookupDomain', () => {
  it('returns a normalised result for a registered domain', async () => {
    lookupRdapDomain.mockResolvedValue(FOUND);

    const result = await lookupDomain('  HTTPS://Example.com/path  ');

    expect(lookupRdapDomain).toHaveBeenCalledWith('example.com', expect.anything());
    expect(result).toMatchObject({
      query: 'example.com',
      type: 'domain',
      registered: true,
      availability: 'registered',
      source: { protocol: 'rdap', resolvedVia: 'iana-bootstrap' },
    });
    expect(result.domain?.name).toBe('EXAMPLE.COM');
    expect(result.nameservers).toHaveLength(2);
    expect(result.dnssec?.status).toBe('signed');
    expect(result.raw).toBe(exampleComRdap);
  });

  it('omits the raw payload when asked', async () => {
    lookupRdapDomain.mockResolvedValue(FOUND);
    const result = await lookupDomain('example.com', { includeRaw: false });
    expect(result.raw).toBeNull();
  });

  it('reports a missing domain as possibly available, not as an error', async () => {
    lookupRdapDomain.mockResolvedValue(NOT_FOUND);

    const result = await lookupDomain('nope-1234.com');

    expect(result).toMatchObject({
      query: 'nope-1234.com',
      registered: false,
      availability: 'possibly_available',
      domain: null,
      dates: null,
      nameservers: [],
    });
  });

  it('resolves www to the registrable domain in a single upstream call', async () => {
    lookupRdapDomain.mockResolvedValue(FOUND);

    const result = await lookupDomain('www.example.com');

    expect(lookupRdapDomain).toHaveBeenCalledTimes(1);
    expect(lookupRdapDomain).toHaveBeenCalledWith('example.com', expect.anything());
    expect(result.query).toBe('www.example.com');
    expect(result.warnings.join(' ')).toContain('example.com');
  });

  it('walks up to the parent domain when a subdomain is unknown', async () => {
    lookupRdapDomain.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(FOUND);

    const result = await lookupDomain('shop.example.co.uk');

    expect(lookupRdapDomain).toHaveBeenNthCalledWith(1, 'shop.example.co.uk', expect.anything());
    expect(lookupRdapDomain).toHaveBeenNthCalledWith(2, 'example.co.uk', expect.anything());
    expect(result.registered).toBe(true);
  });

  it('records a warning when the redirector answered instead of the registry', async () => {
    lookupRdapDomain.mockResolvedValue({ ...FOUND, via: 'rdap-redirector' });
    const result = await lookupDomain('example.com');
    expect(result.warnings.join(' ')).toContain('rdap.org');
    expect(result.source.resolvedVia).toBe('rdap-redirector');
  });

  it('rejects an invalid domain before any upstream call', async () => {
    await expect(lookupDomain('not a domain')).rejects.toThrowError(ApiError);
    expect(lookupRdapDomain).not.toHaveBeenCalled();

    await expect(lookupDomain('user@example.com')).rejects.toMatchObject({
      code: 'INVALID_DOMAIN',
      status: 400,
    });
  });

  it.each([
    ['timeout', 'UPSTREAM_TIMEOUT', 504],
    ['rate_limited', 'RATE_LIMITED', 429],
    ['upstream', 'RDAP_ERROR', 502],
    ['malformed', 'RDAP_ERROR', 502],
  ] as const)('maps an upstream %s failure to %s', async (reason, code, status) => {
    lookupRdapDomain.mockResolvedValue({
      kind: 'error',
      url: 'https://rdap.verisign.com/com/v1/domain/example.com',
      via: 'iana-bootstrap',
      status: null,
      reason,
      message: 'upstream said no',
    });

    await expect(lookupDomain('example.com')).rejects.toMatchObject({ code, status });
  });

  it('distinguishes an unsupported TLD from a name that does not exist', async () => {
    // `denic.de` is plainly registered; .de simply publishes no RDAP service.
    // Reporting that as "not found" would tell a client the opposite of the truth.
    lookupRdapDomain.mockResolvedValue({ kind: 'no-service' });
    await expect(lookupDomain('denic.de')).rejects.toMatchObject({
      code: 'RDAP_UNSUPPORTED_TLD',
      status: 501,
    });

    lookupRdapDomain.mockResolvedValue(NOT_FOUND);
    const absent = await lookupDomain('nope-1234.com');
    expect(absent.registered).toBe(false);
  });

  it('gives up with UPSTREAM_TIMEOUT rather than overrunning its budget', async () => {
    // Walking up to a parent domain is the one place a lookup fans out. With no
    // budget left it must stop there: overrunning means the platform kills the
    // invocation and the caller gets an opaque error page instead of ours.
    lookupRdapDomain.mockResolvedValue(FOUND);

    await expect(
      lookupDomain('example.com', { deadline: createDeadline(0) }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT', status: 504 });

    expect(lookupRdapDomain).not.toHaveBeenCalled();
  });

  it('passes one shared deadline to every candidate', async () => {
    lookupRdapDomain.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(FOUND);

    await lookupDomain('shop.example.co.uk');

    const deadlines = lookupRdapDomain.mock.calls.map((call) => call[1]);
    expect(deadlines).toHaveLength(2);
    expect(deadlines[0]).toBe(deadlines[1]);
  });
});
