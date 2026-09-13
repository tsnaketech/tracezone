import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { formatFromAccept, parseAcceptHeader, resolveFormat } from '@/lib/api/format';
import { BOOLEAN_PARAM_VALUES, parseBooleanParam } from '@/lib/api/params';

function resolve(search: string, accept?: string) {
  const url = new URL(`https://tracezone.test/api/v1/domain/example.com${search}`);
  const headers = new Headers(accept === undefined ? {} : { accept });
  return resolveFormat(url, headers);
}

describe('parseAcceptHeader', () => {
  it('sorts by quality then by order', () => {
    const entries = parseAcceptHeader('text/toon;q=0.4, application/json;q=0.9, */*;q=0.1');
    expect(entries.map((entry) => entry.mediaType)).toEqual([
      'application/json',
      'text/toon',
      '*/*',
    ]);
  });

  it('drops entries with q=0', () => {
    expect(parseAcceptHeader('application/json;q=0')).toEqual([]);
  });

  it('returns nothing for an absent header', () => {
    expect(parseAcceptHeader(null)).toEqual([]);
    expect(parseAcceptHeader('  ')).toEqual([]);
  });
});

describe('formatFromAccept', () => {
  it.each([
    ['application/json', 'json'],
    ['text/toon', 'toon'],
    ['application/toon', 'toon'],
    ['application/rdap+json', 'json'],
    ['*/*', 'json'],
    ['text/*', 'toon'],
  ])('maps %s to %s', (accept, expected) => {
    expect(formatFromAccept(accept)).toBe(expected);
  });

  it('returns null when nothing matches', () => {
    expect(formatFromAccept('image/png')).toBeNull();
    expect(formatFromAccept(undefined)).toBeNull();
  });
});

describe('resolveFormat', () => {
  it('defaults to JSON', () => {
    expect(resolve('')).toBe('json');
  });

  it('honours an explicit format parameter', () => {
    expect(resolve('?format=toon')).toBe('toon');
    expect(resolve('?format=JSON')).toBe('json');
    expect(resolve('?format=%20toon%20')).toBe('toon');
  });

  it('gives the format parameter precedence over Accept', () => {
    expect(resolve('?format=toon', 'application/json')).toBe('toon');
    expect(resolve('?format=json', 'text/toon')).toBe('json');
  });

  it('uses Accept when no parameter is supplied', () => {
    expect(resolve('', 'text/toon')).toBe('toon');
    expect(resolve('', 'application/json')).toBe('json');
  });

  it('falls back to JSON for an unrecognised Accept header', () => {
    expect(resolve('', 'image/png')).toBe('json');
  });

  it('rejects an unsupported format instead of silently serving JSON', () => {
    expect(() => resolve('?format=yaml')).toThrowError(ApiError);
    try {
      resolve('?format=yaml');
    } catch (error) {
      expect((error as ApiError).code).toBe('INVALID_FORMAT');
      expect((error as ApiError).status).toBe(400);
    }
  });

  it('ignores an empty format parameter', () => {
    expect(resolve('?format=', 'text/toon')).toBe('toon');
  });
});

describe('parseBooleanParam', () => {
  const url = (search: string) =>
    new URL(`https://tracezone.test/api/v1/domain/example.com${search}`);

  it('returns the fallback when the parameter is absent', () => {
    expect(parseBooleanParam(url(''), 'raw', true)).toBe(true);
    expect(parseBooleanParam(url(''), 'raw', false)).toBe(false);
  });

  it.each(['true', '1', 'yes', 'TRUE', ' Yes '])('reads %s as true', (value) => {
    expect(parseBooleanParam(url(`?raw=${encodeURIComponent(value)}`), 'raw', false)).toBe(true);
  });

  it.each(['false', '0', 'no', 'FALSE', ' No '])('reads %s as false', (value) => {
    expect(parseBooleanParam(url(`?raw=${encodeURIComponent(value)}`), 'raw', true)).toBe(false);
  });

  // `raw=maybe` used to be read as true and `raw=0` as false, so a typo
  // silently changed the shape of the response. An explicitly empty value is
  // still an explicit value, and is rejected too.
  it.each(['maybe', 'y', '2', 'null', ''])('rejects %s instead of guessing', (value) => {
    const target = url(`?raw=${encodeURIComponent(value)}`);
    expect(() => parseBooleanParam(target, 'raw', true)).toThrowError(ApiError);
  });

  it('reports INVALID_PARAMETER with a 400 and names the accepted values', () => {
    try {
      parseBooleanParam(url('?raw=maybe'), 'raw', true);
      expect.unreachable('should have thrown');
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.code).toBe('INVALID_PARAMETER');
      expect(apiError.status).toBe(400);
      expect(apiError.message).toContain('raw');
      for (const value of BOOLEAN_PARAM_VALUES) {
        expect(apiError.message).toContain(value);
      }
    }
  });
});
