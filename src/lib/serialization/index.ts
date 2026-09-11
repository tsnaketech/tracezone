/**
 * One serialisation entry point for every output format TraceZone speaks.
 *
 * Adding a format means adding a module next to `json.ts` / `toon.ts` and a
 * line in the two maps below; nothing else in the codebase needs to change.
 */

import { JSON_CONTENT_TYPE, toJson } from '@/lib/serialization/json';
import { TOON_CONTENT_TYPE, toToon } from '@/lib/serialization/toon';

export const OUTPUT_FORMATS = ['json', 'toon'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const DEFAULT_FORMAT: OutputFormat = 'json';

export const CONTENT_TYPES: Record<OutputFormat, string> = {
  json: JSON_CONTENT_TYPE,
  toon: TOON_CONTENT_TYPE,
};

const SERIALIZERS: Record<OutputFormat, (data: unknown) => string> = {
  json: toJson,
  toon: toToon,
};

export function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === 'string' && (OUTPUT_FORMATS as readonly string[]).includes(value);
}

/** Serialise `data` in `format`. Both formats represent identical data. */
export function serialize(data: unknown, format: OutputFormat = DEFAULT_FORMAT): string {
  return SERIALIZERS[format](data);
}

export function contentTypeFor(format: OutputFormat): string {
  return CONTENT_TYPES[format];
}

export { toJson, toToon };
