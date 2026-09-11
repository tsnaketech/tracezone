/**
 * Minimal structural types for the RDAP wire format (RFC 7483 / RFC 9083).
 *
 * These describe what we *read* from registries. They are intentionally loose —
 * every field is optional, because RDAP deployments vary widely and a missing
 * key must never be a crash. Everything TraceZone exposes publicly is defined
 * separately in `@/lib/lookup/types`.
 */

export interface RdapLink {
  readonly value?: string;
  readonly rel?: string;
  readonly href?: string;
  readonly type?: string;
  readonly title?: string;
}

export interface RdapEvent {
  readonly eventAction?: string;
  readonly eventActor?: string;
  readonly eventDate?: string;
}

export interface RdapNotice {
  readonly title?: string;
  readonly type?: string;
  readonly description?: readonly string[];
  readonly links?: readonly RdapLink[];
}

export interface RdapPublicId {
  readonly type?: string;
  readonly identifier?: string;
}

/** jCard (RFC 7095): `['vcard', [[name, params, type, value], ...]]`. */
export type RdapVcardEntry = readonly [string, Record<string, unknown>, string, unknown];
export type RdapVcardArray = readonly ['vcard', readonly RdapVcardEntry[]];

export interface RdapEntity {
  readonly objectClassName?: string;
  readonly handle?: string;
  readonly roles?: readonly string[];
  readonly vcardArray?: RdapVcardArray;
  readonly publicIds?: readonly RdapPublicId[];
  readonly entities?: readonly RdapEntity[];
  readonly remarks?: readonly RdapNotice[];
  readonly links?: readonly RdapLink[];
  readonly events?: readonly RdapEvent[];
  readonly status?: readonly string[];
}

export interface RdapNameserver {
  readonly objectClassName?: string;
  readonly ldhName?: string;
  readonly unicodeName?: string;
  readonly handle?: string;
  readonly status?: readonly string[];
  readonly ipAddresses?: {
    readonly v4?: readonly string[];
    readonly v6?: readonly string[];
  };
}

export interface RdapDsData {
  readonly keyTag?: number;
  readonly algorithm?: number;
  readonly digestType?: number;
  readonly digest?: string;
}

export interface RdapKeyData {
  readonly flags?: number;
  readonly protocol?: number;
  readonly algorithm?: number;
  readonly publicKey?: string;
}

export interface RdapSecureDns {
  readonly zoneSigned?: boolean;
  readonly delegationSigned?: boolean;
  readonly maxSigLife?: number;
  readonly dsData?: readonly RdapDsData[];
  readonly keyData?: readonly RdapKeyData[];
}

/** RFC 9537 redaction signalling. */
export interface RdapRedaction {
  readonly name?: { readonly type?: string; readonly description?: string };
  readonly reason?: { readonly type?: string; readonly description?: string };
  readonly prePath?: string;
  readonly postPath?: string;
  readonly pathLang?: string;
  readonly method?: string;
}

export interface RdapDomain {
  readonly objectClassName?: string;
  readonly rdapConformance?: readonly string[];
  readonly handle?: string;
  readonly ldhName?: string;
  readonly unicodeName?: string;
  readonly status?: readonly string[];
  readonly events?: readonly RdapEvent[];
  readonly entities?: readonly RdapEntity[];
  readonly nameservers?: readonly RdapNameserver[];
  readonly secureDNS?: RdapSecureDns;
  readonly notices?: readonly RdapNotice[];
  readonly remarks?: readonly RdapNotice[];
  readonly links?: readonly RdapLink[];
  readonly port43?: string;
  readonly redacted?: readonly RdapRedaction[];
}

/** RDAP error payload (RFC 9083 §6). */
export interface RdapErrorResponse {
  readonly errorCode?: number;
  readonly title?: string;
  readonly description?: readonly string[];
}

/** The IANA RDAP bootstrap registry (RFC 9224). */
export interface RdapBootstrapRegistry {
  readonly version?: string;
  readonly publication?: string;
  readonly description?: string;
  /** `[[tlds], [serviceUrls]]` tuples. */
  readonly services?: readonly (readonly [readonly string[], readonly string[]])[];
}
