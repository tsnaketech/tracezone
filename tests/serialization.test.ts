import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_TYPES,
  contentTypeFor,
  isOutputFormat,
  serialize,
  toJson,
  toToon,
} from '@/lib/serialization';

const SAMPLE = {
  query: 'example.com',
  registered: true,
  nameservers: [
    { name: 'A.IANA-SERVERS.NET', ipv4: [] as string[] },
    { name: 'B.IANA-SERVERS.NET', ipv4: ['199.43.133.53'] },
  ],
  dates: { created: '1995-08-14T04:00:00.000Z', expires: null },
};

describe('serialize', () => {
  it('produces indented JSON by default', () => {
    const output = serialize(SAMPLE);
    expect(output).toBe(toJson(SAMPLE));
    expect(output.split('\n').length).toBeGreaterThan(1);
    expect(JSON.parse(output)).toEqual(SAMPLE);
  });

  it('produces TOON when asked', () => {
    expect(serialize(SAMPLE, 'toon')).toBe(toToon(SAMPLE));
  });

  it('round-trips TOON back to exactly the JSON data', () => {
    expect(decode(toToon(SAMPLE))).toEqual(JSON.parse(toJson(SAMPLE)));
  });

  it('emits TOON that is more compact than pretty JSON', () => {
    expect(toToon(SAMPLE).length).toBeLessThan(toJson(SAMPLE).length);
  });

  it.each([null, [], {}, 0, 'text', true])(
    'serialises the primitive %s in both formats',
    (value) => {
      expect(() => toJson(value)).not.toThrow();
      expect(() => toToon(value)).not.toThrow();
    },
  );

  it('drops undefined consistently in both formats', () => {
    const withUndefined = { a: 1, b: undefined };
    expect(JSON.parse(toJson(withUndefined))).toEqual({ a: 1 });
    expect(decode(toToon(withUndefined))).toEqual({ a: 1 });
  });
});

describe('format metadata', () => {
  it('maps each format to a content type', () => {
    expect(contentTypeFor('json')).toBe(CONTENT_TYPES.json);
    expect(contentTypeFor('json')).toContain('application/json');
    expect(contentTypeFor('toon')).toContain('text/toon');
  });

  it.each([
    ['json', true],
    ['toon', true],
    ['yaml', false],
    ['', false],
    [null, false],
  ])('recognises %s as a format: %s', (value, expected) => {
    expect(isOutputFormat(value)).toBe(expected);
  });
});
