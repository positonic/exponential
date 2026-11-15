/**
 * Serialise structured data for a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` leaves `<` alone, so a string containing `</script>` would
 * close the element early and the rest would be parsed as markup. Escaping
 * every `<` as `\u003c` keeps the JSON identical to a parser and inert to HTML.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
