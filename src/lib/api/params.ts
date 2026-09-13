/**
 * Query parameter parsing.
 *
 * Strict by design, for the same reason `?format=` is strict: reading an
 * unrecognised value as the default hides a client bug instead of reporting it,
 * and the caller silently gets a response shaped differently from the one it
 * asked for.
 */

import { ApiError } from '@/lib/api/errors';

const TRUTHY = ['true', '1', 'yes'] as const;
const FALSY = ['false', '0', 'no'] as const;

export const BOOLEAN_PARAM_VALUES: readonly string[] = [...TRUTHY, ...FALSY];

/**
 * Read a boolean query parameter.
 *
 * @throws {ApiError} `INVALID_PARAMETER` when the value is present but is not
 * one of {@link BOOLEAN_PARAM_VALUES}.
 */
export function parseBooleanParam(url: URL, name: string, fallback: boolean): boolean {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;

  const normalized = raw.trim().toLowerCase();
  if ((TRUTHY as readonly string[]).includes(normalized)) return true;
  if ((FALSY as readonly string[]).includes(normalized)) return false;

  throw new ApiError(
    'INVALID_PARAMETER',
    `Unsupported value "${raw}" for "${name}". Expected one of: ${BOOLEAN_PARAM_VALUES.join(', ')}.`,
  );
}
