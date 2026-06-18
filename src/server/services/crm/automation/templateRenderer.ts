/**
 * Pure agreement-template renderer (CONTEXT.md → CRM & Automations, ADR-0026).
 *
 * Fills `{{placeholder}}` tokens in an HTML template with contact data. Kept
 * pure (no fs, no DB) so substitution and missing-variable handling are
 * unit-tested in isolation; the file loading lives in `agreementTemplates.ts`.
 */

export interface RenderResult {
  /** The template with every `{{token}}` substituted (missing → empty string). */
  html: string;
  /** Distinct token names that had no value — for caller logging/QA. */
  missingVariables: string[];
}

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Substitute `{{token}}` occurrences in `template` from `data`.
 *
 * A token with no (or empty) value is replaced with an empty string and
 * reported in `missingVariables` — so a raw `{{placeholder}}` never leaks into
 * the rendered agreement.
 */
export function renderTemplate(
  template: string,
  data: Record<string, string>,
): RenderResult {
  const missing = new Set<string>();

  const html = template.replace(TOKEN, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = data[key];
    if (value === undefined || value === null || value === "") {
      missing.add(key);
      return "";
    }
    return value;
  });

  return { html, missingVariables: [...missing] };
}
