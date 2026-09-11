/** JSON output. Pretty-printed so the raw view is readable without tooling. */

export const JSON_INDENT = 2;

export function toJson(data: unknown): string {
  return JSON.stringify(data, null, JSON_INDENT);
}

export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
