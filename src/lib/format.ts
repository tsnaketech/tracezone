/**
 * Presentation helpers.
 *
 * Display-only: nothing here is used to build a request or to decide an
 * outcome, and the original upstream value always stays reachable next to the
 * formatted one.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false,
});

/** `14 Aug 1995, 04:00 UTC`, or `null` for an unusable value. */
export function formatDate(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${DATE_FORMAT.format(date)} UTC`;
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600 * 1000],
  ['month', 30 * 24 * 3600 * 1000],
  ['day', 24 * 3600 * 1000],
  ['hour', 3600 * 1000],
  ['minute', 60 * 1000],
];

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** `29 years ago` / `in 3 months`, or `null` when the date is unusable. */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const delta = date.getTime() - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return RELATIVE_FORMAT.format(Math.round(delta / ms), unit);
  }
  return 'just now';
}

/** `clientTransferProhibited` -> `client transfer prohibited`. */
export function humanizeStatus(status: string): string {
  return status
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
}

/** `registrar` -> `Registrar`, `abuse` -> `Abuse`. */
export function humanizeRole(role: string): string {
  const spaced = humanizeStatus(role);
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Statuses that mean something is wrong or pending, so the UI can colour them
 * differently from the ordinary registry locks.
 */
const WARNING_STATUSES = new Set([
  'pending delete',
  'pending transfer',
  'pending restore',
  'redemption period',
  'client hold',
  'server hold',
  'inactive',
]);

export type StatusTone = 'success' | 'warning' | 'neutral';

export function statusTone(status: string): StatusTone {
  const normalized = humanizeStatus(status);
  if (normalized === 'active' || normalized === 'ok') return 'success';
  if (WARNING_STATUSES.has(normalized)) return 'warning';
  return 'neutral';
}
