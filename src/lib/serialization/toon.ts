/**
 * TOON output — Token-Oriented Object Notation.
 *
 * Uses the reference implementation (`@toon-format/toon`), which is dependency
 * free and pure ESM, so it runs unchanged on Vercel's Node runtime.
 *
 * The payload is round-tripped through JSON first. That is not ceremony: it
 * drops `undefined`, applies any `toJSON()` hooks, and guarantees the documented
 * property that the TOON body carries exactly the same data as the JSON body.
 */

import { encode } from '@toon-format/toon';

export const TOON_CONTENT_TYPE = 'text/toon; charset=utf-8';
export const TOON_INDENT = 2;

export function toToon(data: unknown): string {
  const jsonSafe: unknown = JSON.parse(JSON.stringify(data ?? null));
  return encode(jsonSafe, { indentSize: TOON_INDENT });
}
