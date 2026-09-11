import { describe, expect, it } from 'vitest';
import { domainCandidates, tldOf, validateDomain } from '@/lib/validation/domain';

describe('validateDomain', () => {
  it('accepts a plain domain unchanged', () => {
    const result = validateDomain('example.com');
    expect(result).toMatchObject({ ok: true, domain: 'example.com', normalized: false });
  });

  it.each([
    ['  EXAMPLE.COM  ', 'example.com'],
    ['Example.Com', 'example.com'],
    ['example.com.', 'example.com'],
    ['"example.com"', 'example.com'],
  ])('normalises %s to %s', (input, expected) => {
    const result = validateDomain(input);
    expect(result.ok && result.domain).toBe(expected);
  });

  it.each([
    ['https://www.example.com/test', 'www.example.com'],
    ['http://example.com:8080/a/b?c=d#e', 'example.com'],
    ['//example.com/path', 'example.com'],
    ['ftp://files.example.com', 'files.example.com'],
  ])('strips URL syntax from %s', (input, expected) => {
    const result = validateDomain(input);
    expect(result.ok).toBe(true);
    expect(result.ok && result.domain).toBe(expected);
    expect(result.ok && result.normalized).toBe(true);
  });

  it('converts IDN input to punycode', () => {
    const result = validateDomain('bücher.de');
    expect(result.ok && result.domain).toBe('xn--bcher-kva.de');
  });

  it('accepts an already-punycoded name', () => {
    const result = validateDomain('xn--bcher-kva.de');
    expect(result.ok && result.domain).toBe('xn--bcher-kva.de');
  });

  it('keeps subdomains intact', () => {
    const result = validateDomain('a.b.example.co.uk');
    expect(result.ok && result.domain).toBe('a.b.example.co.uk');
  });

  it.each([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['example', 'NOT_A_FQDN'],
    ['user@example.com', 'LOOKS_LIKE_EMAIL'],
    ['https://user:pass@example.com', 'LOOKS_LIKE_EMAIL'],
    ['exa mple.com', 'CONTAINS_WHITESPACE'],
    ['93.184.216.34', 'IP_ADDRESS'],
    ['[2606:2800:220:1:248:1893:25c8:1946]', 'IP_ADDRESS'],
    ['example..com', 'INVALID_LABEL'],
    ['-example.com', 'INVALID_LABEL'],
    ['example.123', 'INVALID_TLD'],
    ['example.c', 'INVALID_TLD'],
  ])('rejects %s with %s', (input, reason) => {
    const result = validateDomain(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe(reason);
  });

  it('rejects a label longer than 63 characters', () => {
    const result = validateDomain(`${'a'.repeat(64)}.com`);
    expect(!result.ok && result.reason).toBe('LABEL_TOO_LONG');
  });

  it('rejects an over-long input without parsing it', () => {
    const result = validateDomain(`${'a'.repeat(500)}.com`);
    expect(!result.ok && result.reason).toBe('TOO_LONG');
  });

  it('rejects non-string input', () => {
    expect(validateDomain(undefined).ok).toBe(false);
    expect(validateDomain(42).ok).toBe(false);
  });

  it('always reports a human-readable message on failure', () => {
    const result = validateDomain('nope');
    expect(!result.ok && result.message.length).toBeGreaterThan(0);
  });
});

describe('domainCandidates', () => {
  it('returns the name itself for a registrable domain', () => {
    expect(domainCandidates('example.com')).toEqual(['example.com']);
  });

  it('drops a leading www rather than wasting an upstream request', () => {
    expect(domainCandidates('www.example.com')).toEqual(['example.com']);
  });

  it('walks up the tree for a deep name', () => {
    expect(domainCandidates('a.b.example.co.uk')).toEqual([
      'a.b.example.co.uk',
      'b.example.co.uk',
      'example.co.uk',
    ]);
  });

  it('bounds the number of candidates', () => {
    expect(domainCandidates('a.b.c.d.e.example.com')).toHaveLength(3);
  });

  it('never produces a single-label candidate', () => {
    for (const candidate of domainCandidates('a.b.example.com')) {
      expect(candidate.split('.').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('tldOf', () => {
  it('returns the last label', () => {
    expect(tldOf('example.co.uk')).toBe('uk');
    expect(tldOf('example.com')).toBe('com');
  });
});
