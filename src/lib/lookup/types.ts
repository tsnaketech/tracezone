/**
 * The public TraceZone data model.
 *
 * This is the contract the API and the UI are built on. It is deliberately
 * protocol-independent: RDAP is today's source, but a WHOIS fallback or a DNS
 * lookup would populate the same envelope. Adding a new lookup kind means
 * adding a sibling result type with the same `query` / `type` / `source` head.
 */

export type LookupType = 'domain';

export type Availability = 'registered' | 'possibly_available' | 'unknown';

export type DnssecStatus = 'signed' | 'unsigned' | 'unknown';

export interface LookupSource {
  readonly protocol: 'rdap';
  /** The RDAP endpoint that produced the answer, or `null` if none replied. */
  readonly url: string | null;
  /** How the endpoint was discovered. */
  readonly resolvedVia: 'iana-bootstrap' | 'rdap-redirector' | 'none';
  readonly retrievedAt: string;
}

export interface DomainIdentity {
  /** LDH (ASCII) name as reported by the registry. */
  readonly name: string;
  readonly unicodeName: string | null;
  readonly handle: string | null;
  readonly statuses: readonly string[];
}

export interface RegistrarInfo {
  readonly name: string | null;
  readonly handle: string | null;
  /** IANA registrar ID when published. */
  readonly ianaId: string | null;
  readonly url: string | null;
  readonly abuseEmail: string | null;
  readonly abusePhone: string | null;
}

export interface DomainEvent {
  readonly action: string;
  /** ISO 8601 as published by the registry, or `null` when unparseable. */
  readonly date: string | null;
}

export interface DomainDates {
  readonly created: string | null;
  readonly updated: string | null;
  readonly expires: string | null;
  readonly transferred: string | null;
  /** Every event the registry published, including the ones above. */
  readonly events: readonly DomainEvent[];
}

export interface NameserverInfo {
  readonly name: string;
  readonly unicodeName: string | null;
  readonly ipv4: readonly string[];
  readonly ipv6: readonly string[];
}

export interface DnssecInfo {
  readonly status: DnssecStatus;
  readonly delegationSigned: boolean | null;
  readonly zoneSigned: boolean | null;
  readonly dsRecords: readonly {
    readonly keyTag: number | null;
    readonly algorithm: number | null;
    readonly digestType: number | null;
  }[];
}

export interface EntityInfo {
  readonly handle: string | null;
  readonly roles: readonly string[];
  readonly name: string | null;
  readonly organization: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly kind: string | null;
  /** Registry remarks, which is where redaction notices live. */
  readonly remarks: readonly TextBlock[];
}

export interface TextBlock {
  readonly title: string | null;
  readonly type: string | null;
  readonly description: readonly string[];
}

export interface RedactionInfo {
  /** `true` when the registry signalled RFC 9537 redaction. */
  readonly applied: boolean;
  /** Names of the redacted fields, exactly as published. */
  readonly fields: readonly string[];
}

export interface DomainLookupResult {
  /** The normalised name that was asked for. */
  readonly query: string;
  readonly type: LookupType;
  /** `true` only when an RDAP server returned a domain object. */
  readonly registered: boolean;
  readonly availability: Availability;
  readonly source: LookupSource;
  readonly domain: DomainIdentity | null;
  readonly registrar: RegistrarInfo | null;
  readonly dates: DomainDates | null;
  readonly nameservers: readonly NameserverInfo[];
  readonly dnssec: DnssecInfo | null;
  readonly entities: readonly EntityInfo[];
  readonly redaction: RedactionInfo;
  readonly notices: readonly TextBlock[];
  readonly remarks: readonly TextBlock[];
  /** Non-fatal notes about the lookup itself (fallbacks, parent-domain hops). */
  readonly warnings: readonly string[];
  /** The untouched RDAP payload, omitted when `raw=false` is requested. */
  readonly raw: unknown;
}
