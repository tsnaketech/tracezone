/**
 * Translate a raw RDAP domain object into the TraceZone data model.
 *
 * Registries disagree about almost everything except the shape of the envelope,
 * so every accessor here is defensive: unknown keys are ignored, missing keys
 * become `null`, and anything the registry redacted simply stays absent.
 */

import type {
  DnssecInfo,
  DomainDates,
  DomainEvent,
  DomainIdentity,
  EntityInfo,
  NameserverInfo,
  RedactionInfo,
  RegistrarInfo,
  TextBlock,
} from '@/lib/lookup/types';
import type { RdapDomain, RdapEntity, RdapEvent, RdapLink, RdapNotice } from '@/lib/rdap/types';
import { parseVcard } from '@/lib/rdap/vcard';

function asArray<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Normalise an RDAP date to ISO 8601, keeping `null` when it is unusable. */
export function normalizeDate(value: unknown): string | null {
  const raw = asString(value);
  if (raw === null) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function eventDate(events: readonly RdapEvent[], action: string): string | null {
  for (const event of events) {
    if (asString(event.eventAction)?.toLowerCase() === action) {
      return normalizeDate(event.eventDate);
    }
  }
  return null;
}

export function normalizeTextBlocks(blocks: readonly RdapNotice[] | undefined): TextBlock[] {
  return asArray(blocks).map((block) => ({
    title: asString(block.title),
    type: asString(block.type),
    description: asArray(block.description).filter(
      (line): line is string => typeof line === 'string',
    ),
  }));
}

function findLink(links: readonly RdapLink[] | undefined, rels: readonly string[]): string | null {
  for (const link of asArray(links)) {
    const rel = asString(link.rel)?.toLowerCase();
    const href = asString(link.href);
    if (href === null || rel === null || rel === undefined) continue;
    if (rels.includes(rel) && href.startsWith('http')) return href;
  }
  return null;
}

/** Breadth-first search for the first entity carrying `role`. */
function findEntityByRole(
  entities: readonly RdapEntity[] | undefined,
  role: string,
): RdapEntity | null {
  for (const entity of asArray(entities)) {
    const roles = asArray(entity.roles).map((value) => String(value).toLowerCase());
    if (roles.includes(role)) return entity;
  }
  for (const entity of asArray(entities)) {
    const nested = findEntityByRole(entity.entities, role);
    if (nested !== null) return nested;
  }
  return null;
}

export function normalizeIdentity(domain: RdapDomain, fallbackName: string): DomainIdentity {
  return {
    name: asString(domain.ldhName) ?? fallbackName,
    unicodeName: asString(domain.unicodeName),
    handle: asString(domain.handle),
    statuses: asArray(domain.status)
      .filter((status): status is string => typeof status === 'string')
      .map((status) => status.trim().toLowerCase())
      .filter((status) => status !== ''),
  };
}

export function normalizeDates(domain: RdapDomain): DomainDates {
  const events = asArray(domain.events);
  const normalized: DomainEvent[] = events
    .map((event) => ({
      action: asString(event.eventAction) ?? 'unknown',
      date: normalizeDate(event.eventDate),
    }))
    .filter((event) => event.date !== null || event.action !== 'unknown');

  return {
    created: eventDate(events, 'registration'),
    updated: eventDate(events, 'last changed') ?? eventDate(events, 'last update of rdap database'),
    expires: eventDate(events, 'expiration'),
    transferred: eventDate(events, 'transfer'),
    events: normalized,
  };
}

export function normalizeRegistrar(domain: RdapDomain): RegistrarInfo | null {
  const entity = findEntityByRole(domain.entities, 'registrar');
  if (entity === null) return null;

  const contact = parseVcard(entity.vcardArray);
  const ianaId =
    asArray(entity.publicIds).find(
      (id) => asString(id.type)?.toLowerCase().includes('iana') === true,
    )?.identifier ?? null;

  const abuse = findEntityByRole(entity.entities, 'abuse');
  const abuseContact = abuse === null ? null : parseVcard(abuse.vcardArray);

  return {
    name: contact.name ?? contact.organization,
    handle: asString(entity.handle),
    ianaId: asString(ianaId),
    url: findLink(entity.links, ['about', 'related', 'self']),
    abuseEmail: abuseContact?.email ?? null,
    abusePhone: abuseContact?.phone ?? null,
  };
}

export function normalizeNameservers(domain: RdapDomain): NameserverInfo[] {
  return asArray(domain.nameservers)
    .map((nameserver) => {
      const name = asString(nameserver.ldhName) ?? asString(nameserver.unicodeName);
      if (name === null) return null;
      const info: NameserverInfo = {
        name: name.toUpperCase(),
        unicodeName: asString(nameserver.unicodeName),
        ipv4: asArray(nameserver.ipAddresses?.v4).filter(
          (ip): ip is string => typeof ip === 'string',
        ),
        ipv6: asArray(nameserver.ipAddresses?.v6).filter(
          (ip): ip is string => typeof ip === 'string',
        ),
      };
      return info;
    })
    .filter((nameserver): nameserver is NameserverInfo => nameserver !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeDnssec(domain: RdapDomain): DnssecInfo {
  const secure = domain.secureDNS;
  const delegationSigned =
    typeof secure?.delegationSigned === 'boolean' ? secure.delegationSigned : null;
  const zoneSigned = typeof secure?.zoneSigned === 'boolean' ? secure.zoneSigned : null;
  const dsRecords = asArray(secure?.dsData);

  let status: DnssecInfo['status'] = 'unknown';
  if (delegationSigned === true || dsRecords.length > 0) status = 'signed';
  else if (delegationSigned === false) status = 'unsigned';

  return {
    status,
    delegationSigned,
    zoneSigned,
    dsRecords: dsRecords.map((record) => ({
      keyTag: typeof record.keyTag === 'number' ? record.keyTag : null,
      algorithm: typeof record.algorithm === 'number' ? record.algorithm : null,
      digestType: typeof record.digestType === 'number' ? record.digestType : null,
    })),
  };
}

export function normalizeEntities(domain: RdapDomain): EntityInfo[] {
  return asArray(domain.entities).map((entity) => {
    const contact = parseVcard(entity.vcardArray);
    return {
      handle: asString(entity.handle),
      roles: asArray(entity.roles)
        .filter((role): role is string => typeof role === 'string')
        .map((role) => role.toLowerCase()),
      name: contact.name,
      organization: contact.organization,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      kind: contact.kind,
      remarks: normalizeTextBlocks(entity.remarks),
    } satisfies EntityInfo;
  });
}

/**
 * Surface RFC 9537 redaction signalling.
 *
 * TraceZone only reports *that* a field was redacted; it never tries to infer,
 * reconstruct or work around the hidden value.
 */
export function normalizeRedaction(domain: RdapDomain): RedactionInfo {
  const entries = asArray(domain.redacted);
  const fields = entries
    .map((entry) => asString(entry.name?.description) ?? asString(entry.name?.type))
    .filter((field): field is string => field !== null);

  const hasPrivacyRemark = normalizeTextBlocks(domain.remarks).some((remark) => {
    const haystack = [remark.title ?? '', ...remark.description].join(' ').toUpperCase();
    return haystack.includes('REDACTED') || haystack.includes('PRIVACY');
  });

  return { applied: entries.length > 0 || hasPrivacyRemark, fields };
}
