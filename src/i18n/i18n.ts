// Stand-in for Orca's i18next wrapper: the extension ships English only, so every
// call resolves to its fallback string with `{{name}}` placeholders interpolated.
export function translate(
  _key: string,
  fallback: string,
  options?: Record<string, unknown>
): string {
  if (!options) {
    return fallback
  }
  return fallback.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in options ? String(options[name]) : match
  )
}
