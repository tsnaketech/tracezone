import { describe, expect, it } from 'vitest';
import {
  normalizeDate,
  normalizeDates,
  normalizeDnssec,
  normalizeEntities,
  normalizeIdentity,
  normalizeNameservers,
  normalizeRedaction,
  normalizeRegistrar,
} from '@/lib/rdap/normalize';
import { parseVcard } from '@/lib/rdap/vcard';
import type { RdapDomain } from '@/lib/rdap/types';
import { exampleComRdap } from './fixtures/rdap-example-com';

const EMPTY: RdapDomain = {};

describe('normalizeIdentity', () => {
  it('reads the LDH name, handle and lowercased statuses', () => {
    const identity = normalizeIdentity(exampleComRdap, 'EXAMPLE.COM');
    expect(identity.name).toBe('EXAMPLE.COM');
    expect(identity.handle).toBe('2336799_DOMAIN_COM-VRSN');
    expect(identity.statuses).toEqual([
      'client delete prohibited',
      'clienttransferprohibited',
      'active',
    ]);
  });

  it('falls back to the queried name when the registry omits ldhName', () => {
    expect(normalizeIdentity(EMPTY, 'FALLBACK.COM').name).toBe('FALLBACK.COM');
  });
});

describe('normalizeDates', () => {
  it('maps RDAP event actions onto named dates', () => {
    const dates = normalizeDates(exampleComRdap);
    expect(dates.created).toBe('1995-08-14T04:00:00.000Z');
    expect(dates.expires).toBe('2026-08-13T04:00:00.000Z');
    expect(dates.updated).toBe('2025-08-14T07:01:34.000Z');
    expect(dates.transferred).toBeNull();
    expect(dates.events.length).toBe(4);
  });

  it('falls back to the RDAP database update when there is no last-changed event', () => {
    const dates = normalizeDates({
      events: [{ eventAction: 'last update of RDAP database', eventDate: '2026-01-02T03:04:05Z' }],
    });
    expect(dates.updated).toBe('2026-01-02T03:04:05.000Z');
  });

  it('returns nulls for an empty object', () => {
    const dates = normalizeDates(EMPTY);
    expect(dates).toMatchObject({ created: null, updated: null, expires: null, events: [] });
  });
});

describe('normalizeDate', () => {
  it.each([
    ['1995-08-14T04:00:00Z', '1995-08-14T04:00:00.000Z'],
    ['not a date', null],
    ['', null],
    [undefined, null],
    [42, null],
  ])('normalises %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });
});

describe('normalizeRegistrar', () => {
  it('extracts the registrar and its abuse contact', () => {
    const registrar = normalizeRegistrar(exampleComRdap);
    expect(registrar).toMatchObject({
      name: 'RESERVED-Internet Assigned Numbers Authority',
      handle: '376',
      ianaId: '376',
      url: 'https://res-dom.iana.org',
      abuseEmail: 'abuse@example-registrar.test',
      abusePhone: 'tel:+1.5555550100',
    });
  });

  it('returns null when no registrar entity is published', () => {
    expect(normalizeRegistrar(EMPTY)).toBeNull();
  });
});

describe('normalizeNameservers', () => {
  it('uppercases, sorts and keeps IP addresses', () => {
    const nameservers = normalizeNameservers(exampleComRdap);
    expect(nameservers.map((ns) => ns.name)).toEqual(['A.IANA-SERVERS.NET', 'B.IANA-SERVERS.NET']);
    expect(nameservers[1]?.ipv4).toEqual(['199.43.133.53']);
    expect(nameservers[1]?.ipv6).toEqual(['2001:500:8d::53']);
    expect(nameservers[0]?.ipv4).toEqual([]);
  });

  it('returns an empty list when there is no delegation', () => {
    expect(normalizeNameservers(EMPTY)).toEqual([]);
  });
});

describe('normalizeDnssec', () => {
  it('reports a signed delegation', () => {
    const dnssec = normalizeDnssec(exampleComRdap);
    expect(dnssec.status).toBe('signed');
    expect(dnssec.dsRecords).toEqual([{ keyTag: 370, algorithm: 13, digestType: 2 }]);
  });

  it('reports unsigned when the registry says so explicitly', () => {
    expect(normalizeDnssec({ secureDNS: { delegationSigned: false } }).status).toBe('unsigned');
  });

  it('reports unknown when secureDNS is absent', () => {
    expect(normalizeDnssec(EMPTY).status).toBe('unknown');
  });

  it('infers signed from DS records alone', () => {
    expect(normalizeDnssec({ secureDNS: { dsData: [{ keyTag: 1 }] } }).status).toBe('signed');
  });
});

describe('normalizeEntities', () => {
  it('flattens jCard contacts', () => {
    const entities = normalizeEntities(exampleComRdap);
    const registrant = entities.find((entity) => entity.roles.includes('registrant'));
    expect(registrant).toMatchObject({
      name: 'Example Holder',
      organization: 'Example Organisation',
      handle: 'REG-1',
    });
    expect(registrant?.address).toContain('One Example Way');
    expect(registrant?.remarks[0]?.title).toBe('REDACTED FOR PRIVACY');
  });
});

describe('parseVcard', () => {
  it('returns empty fields for a missing card', () => {
    expect(parseVcard(undefined)).toMatchObject({ name: null, email: null });
  });

  it('ignores malformed entries instead of throwing', () => {
    expect(parseVcard(['vcard', [['fn'] as never]])).toMatchObject({ name: null });
  });
});

describe('normalizeRedaction', () => {
  it('reports redacted field names without unmasking anything', () => {
    const redaction = normalizeRedaction(exampleComRdap);
    expect(redaction.applied).toBe(true);
    expect(redaction.fields).toEqual(['Registrant Email', 'Tech Phone']);
  });

  it('is not applied when the registry signals nothing', () => {
    expect(normalizeRedaction(EMPTY)).toEqual({ applied: false, fields: [] });
  });

  it('detects a privacy remark even without an RFC 9537 block', () => {
    const redaction = normalizeRedaction({
      remarks: [{ title: 'REDACTED FOR PRIVACY', description: ['...'] }],
    });
    expect(redaction.applied).toBe(true);
  });
});
