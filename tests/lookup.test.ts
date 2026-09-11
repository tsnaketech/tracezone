import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RdapClientModule from '@/lib/rdap/client';
import type { RdapOutcome } from '@/lib/rdap/client';
import { exampleComRdap } from './fixtures/rdap-example-com';

const lookupRdapDomain = vi.hoisted(() => vi.fn<(domain: string) => Promise<RdapOutcome>>());

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

    expect(lookupRdapDomain).toHaveBeenCalledWith('example.com');
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
    expect(lookupRdapDomain).toHaveBeenCalledWith('example.com');
    expect(result.query).toBe('www.example.com');
    expect(result.warnings.join(' ')).toContain('example.com');
  });

  it('walks up to the parent domain when a subdomain is unknown', async () => {
    lookupRdapDomain.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(FOUND);

    const result = await lookupDomain('shop.example.co.uk');

    expect(lookupRdapDomain).toHaveBeenNthCalledWith(1, 'shop.example.co.uk');
    expect(lookupRdapDomain).toHaveBeenNthCalledWith(2, 'example.co.uk');
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

  it('reports a TLD with no RDAP service as DOMAIN_NOT_FOUND', async () => {
    lookupRdapDomain.mockResolvedValue({ kind: 'no-service' });
    await expect(lookupDomain('example.invalidtld')).rejects.toMatchObject({
      code: 'DOMAIN_NOT_FOUND',
      status: 404,
    });
  });
});
