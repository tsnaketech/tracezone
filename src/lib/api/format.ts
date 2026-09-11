/**
 * Output format selection.
 *
 * Two mechanisms, with a documented precedence: an explicit `?format=` wins
 * over `Accept` content negotiation. An explicit request for something we
 * cannot produce is an error, never a silent fallback to JSON — a client that
 * asked for TOON should hear "no" rather than receive JSON it will mis-parse.
 */

import { ApiError } from '@/lib/api/errors';
import {
  DEFAULT_FORMAT,
  OUTPUT_FORMATS,
  isOutputFormat,
  type OutputFormat,
} from '@/lib/serialization';

/** Media types we answer to, in the order we prefer them on a tie. */
const MEDIA_TYPE_FORMATS: ReadonlyArray<readonly [string, OutputFormat]> = [
  ['application/json', 'json'],
  ['text/json', 'json'],
  ['application/rdap+json', 'json'],
  ['text/toon', 'toon'],
  ['application/toon', 'toon'],
];

interface AcceptEntry {
  readonly mediaType: string;
  readonly quality: number;
  readonly order: number;
}

/** Parse an `Accept` header into entries sorted by descending quality. */
export function parseAcceptHeader(header: string | null | undefined): AcceptEntry[] {
  if (typeof header !== 'string' || header.trim() === '') return [];

  return header
    .split(',')
    .map((part, order) => {
      const [rawType, ...params] = part.split(';');
      const mediaType = (rawType ?? '').trim().toLowerCase();
      let quality = 1;
      for (const param of params) {
        const [key, value] = param.split('=');
        if (key?.trim().toLowerCase() === 'q') {
          const parsed = Number.parseFloat((value ?? '').trim());
          if (Number.isFinite(parsed)) quality = Math.min(Math.max(parsed, 0), 1);
        }
      }
      return { mediaType, quality, order };
    })
    .filter((entry) => entry.mediaType !== '' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);
}

/** The best format for an `Accept` header, or `null` when it expresses none. */
export function formatFromAccept(header: string | null | undefined): OutputFormat | null {
  for (const entry of parseAcceptHeader(header)) {
    if (entry.mediaType === '*/*' || entry.mediaType === 'application/*') return DEFAULT_FORMAT;
    if (entry.mediaType === 'text/*') return 'toon';
    const match = MEDIA_TYPE_FORMATS.find(([type]) => type === entry.mediaType);
    if (match !== undefined) return match[1];
  }
  return null;
}

/**
 * Resolve the output format for a request.
 *
 * @throws {ApiError} `INVALID_FORMAT` when `?format=` names something unknown.
 */
export function resolveFormat(url: URL, headers: Headers): OutputFormat {
  const requested = url.searchParams.get('format');

  if (requested !== null && requested.trim() !== '') {
    const normalized = requested.trim().toLowerCase();
    if (!isOutputFormat(normalized)) {
      throw new ApiError(
        'INVALID_FORMAT',
        `Unsupported format "${requested}". Supported formats: ${OUTPUT_FORMATS.join(', ')}.`,
      );
    }
    return normalized;
  }

  return formatFromAccept(headers.get('accept')) ?? DEFAULT_FORMAT;
}
