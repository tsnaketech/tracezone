/**
 * The TraceZone error vocabulary.
 *
 * Every failure that reaches a client is one of these codes. Messages are
 * written for humans, carry no internal detail, and never include a stack
 * trace — the mapping from an internal exception to a code happens once, here.
 *
 * `DOMAIN_NOT_FOUND` is not emitted by the domain endpoint: a name the registry
 * does not know is a *successful* lookup reporting `registered: false`, not an
 * error. It stays in the vocabulary for lookup kinds where absence really is an
 * error (an IP or ASN that no registry claims).
 */

export const API_ERROR_CODES = [
  'INVALID_DOMAIN',
  'INVALID_FORMAT',
  'INVALID_PARAMETER',
  'DOMAIN_NOT_FOUND',
  'RDAP_UNSUPPORTED_TLD',
  'RDAP_ERROR',
  'UPSTREAM_TIMEOUT',
  'RATE_LIMITED',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  INVALID_DOMAIN: 400,
  INVALID_FORMAT: 400,
  INVALID_PARAMETER: 400,
  DOMAIN_NOT_FOUND: 404,
  RDAP_UNSUPPORTED_TLD: 501,
  RDAP_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  RATE_LIMITED: 429,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
};

export const DEFAULT_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_DOMAIN: 'The supplied domain name is invalid.',
  INVALID_FORMAT: 'The requested output format is not supported.',
  INVALID_PARAMETER: 'A query parameter has an unsupported value.',
  DOMAIN_NOT_FOUND: 'The requested object does not exist.',
  RDAP_UNSUPPORTED_TLD: 'No RDAP service is published for this top-level domain.',
  RDAP_ERROR: 'The RDAP server returned an error.',
  UPSTREAM_TIMEOUT: 'The RDAP server did not answer in time.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  METHOD_NOT_ALLOWED: 'This endpoint only accepts GET requests.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
  };
}

/** An error that is safe to render to a client verbatim. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /** Extra response headers, e.g. `Retry-After` on a rate-limit rejection. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: ApiErrorCode, message?: string, headers: Record<string, string> = {}) {
    super(message ?? DEFAULT_ERROR_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.headers = headers;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

/**
 * Convert anything thrown inside a route into a client-safe {@link ApiError}.
 *
 * Unknown throwables collapse to `INTERNAL_ERROR` with a generic message so no
 * internal detail can leak, regardless of the environment.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError('INTERNAL_ERROR');
}
