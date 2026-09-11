/**
 * jCard (RFC 7095) extraction helpers.
 *
 * RDAP entities carry their contact details as a jCard array. Only the public
 * fields a registry chose to publish are read here — redacted or omitted values
 * stay absent, and no attempt is made to reconstruct them.
 */

import type { RdapVcardArray, RdapVcardEntry } from '@/lib/rdap/types';

export interface VcardContact {
  readonly name: string | null;
  readonly organization: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly kind: string | null;
}

export const EMPTY_CONTACT: VcardContact = {
  name: null,
  organization: null,
  email: null,
  phone: null,
  address: null,
  kind: null,
};

function isEntry(value: unknown): value is RdapVcardEntry {
  return Array.isArray(value) && value.length >= 4 && typeof value[0] === 'string';
}

/** Flatten a jCard value, which may be a string or an array of components. */
function flatten(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((part) => flatten(part))
      .filter((part): part is string => part !== null && part !== '');
    return parts.length === 0 ? null : parts.join(', ');
  }
  return null;
}

function firstValue(entries: readonly RdapVcardEntry[], property: string): string | null {
  for (const entry of entries) {
    if (entry[0].toLowerCase() !== property) continue;
    const value = flatten(entry[3]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Extract the commonly displayed contact fields from a jCard.
 *
 * `adr` entries may carry the formatted address in the `label` parameter rather
 * than the value array; both shapes are handled.
 */
export function parseVcard(vcardArray: RdapVcardArray | undefined): VcardContact {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return EMPTY_CONTACT;

  const rawEntries = vcardArray[1];
  if (!Array.isArray(rawEntries)) return EMPTY_CONTACT;
  const entries = rawEntries.filter(isEntry);

  let address = firstValue(entries, 'adr');
  if (address === null) {
    for (const entry of entries) {
      if (entry[0].toLowerCase() !== 'adr') continue;
      const label = (entry[1] as { label?: unknown } | undefined)?.label;
      const flattened = flatten(label);
      if (flattened !== null) {
        address = flattened.replace(/\r?\n/g, ', ');
        break;
      }
    }
  }

  return {
    name: firstValue(entries, 'fn'),
    organization: firstValue(entries, 'org'),
    email: firstValue(entries, 'email'),
    phone: firstValue(entries, 'tel'),
    address,
    kind: firstValue(entries, 'kind'),
  };
}
