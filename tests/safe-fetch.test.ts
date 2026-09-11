import { describe, expect, it } from 'vitest';
import { SafeFetchError, assertSafeUrl } from '@/lib/net/safe-fetch';
import { buildDomainUrl } from '@/lib/rdap/client';
import { parseBootstrap } from '@/lib/rdap/bootstrap';

describe('assertSafeUrl', () => {
  it('accepts a public HTTPS endpoint', () => {
    expect(assertSafeUrl('https://rdap.verisign.com/com/v1/').hostname).toBe('rdap.verisign.com');
    // The URL parser drops the default port, which is exactly what we allow.
    expect(assertSafeUrl('https://rdap.example.org:443/x').port).toBe('');
  });

  it.each([
    'http://rdap.verisign.com/',
    'ftp://rdap.verisign.com/',
    'file:///etc/passwd',
    'https://user:pass@rdap.verisign.com/',
    'https://rdap.verisign.com:8080/',
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/',
    'https://[::1]/',
    'https://localhost/',
    'https://service.internal/',
    'https://printer.local/',
    'https://intranet/',
    'not-a-url',
  ])('blocks %s', (url) => {
    expect(() => assertSafeUrl(url)).toThrowError(SafeFetchError);
  });

  it('reports why a URL was blocked', () => {
    try {
      assertSafeUrl('https://169.254.169.254/');
    } catch (error) {
      expect(error).toBeInstanceOf(SafeFetchError);
      expect((error as SafeFetchError).kind).toBe('blocked');
    }
  });
});

describe('buildDomainUrl', () => {
  it('appends the domain as a single encoded path segment', () => {
    expect(buildDomainUrl('https://rdap.verisign.com/com/v1/', 'example.com')).toBe(
      'https://rdap.verisign.com/com/v1/domain/example.com',
    );
  });

  it('preserves the base path and tolerates a missing trailing slash', () => {
    expect(buildDomainUrl('https://rdap.example.org/v1', 'example.org')).toBe(
      'https://rdap.example.org/v1/domain/example.org',
    );
  });

  it('cannot be escaped with path traversal or a query string', () => {
    const url = buildDomainUrl('https://rdap.verisign.com/com/v1/', '../../evil?x=1');
    expect(new URL(url).hostname).toBe('rdap.verisign.com');
    expect(new URL(url).pathname).toBe('/com/v1/domain/..%2F..%2Fevil%3Fx%3D1');
    expect(new URL(url).search).toBe('');
  });
});

describe('parseBootstrap', () => {
  const registry = {
    services: [
      [['com', 'NET'], ['https://rdap.verisign.com/com/v1']],
      [['insecure'], ['http://rdap.example.test/']],
      [['fr'], ['https://rdap.nic.fr/']],
    ],
  } as const;

  it('indexes TLDs case-insensitively and normalises the base URL', () => {
    const map = parseBootstrap(registry);
    expect(map.get('com')).toEqual(['https://rdap.verisign.com/com/v1/']);
    expect(map.get('net')).toEqual(['https://rdap.verisign.com/com/v1/']);
    expect(map.get('fr')).toEqual(['https://rdap.nic.fr/']);
  });

  it('drops services that only publish plaintext endpoints', () => {
    expect(parseBootstrap(registry).has('insecure')).toBe(false);
  });

  it('survives a malformed document', () => {
    expect(parseBootstrap({}).size).toBe(0);
    expect(parseBootstrap({ services: [] }).size).toBe(0);
  });
});
