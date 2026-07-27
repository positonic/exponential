import { readFileSync } from "fs";
import path from "path";

/**
 * Per-Customer-type **Agreement** template loading (ADR-0026). For the PoC the
 * templates are HTML files in the repo, one per Customer type. The
 * type→filename map (`templateFileForCustomerType`) is pure and unit-tested;
 * the file read is cached.
 *
 * NOTE: read at runtime from the source tree via `process.cwd()`. That is fine
 * for local dev / the PoC demo; for a Vercel production build the templates
 * dir must be included via `outputFileTracingIncludes` (or the templates moved
 * to bundled string constants). Tracked as PoC hardening, out of scope here.
 */

const TEMPLATES_DIR = path.join(
  process.cwd(),
  "src/server/services/crm/automation/templates",
);

export const AGREEMENT_TEMPLATE_FILES: Record<string, string> = {
  "Channel Partner": "channel-partner-agreement.html",
  Advisor: "advisor-agreement.html",
};

/** Pure: the agreement filename for a Customer type, or null if none exists. */
export function templateFileForCustomerType(
  customerType: string,
): string | null {
  return AGREEMENT_TEMPLATE_FILES[customerType] ?? null;
}

const cache = new Map<string, string>();

/** Load (and cache) the raw HTML template for a Customer type. */
export function loadAgreementTemplate(customerType: string): string {
  const file = templateFileForCustomerType(customerType);
  if (!file) {
    throw new Error(
      `No agreement template for customer type: ${customerType}`,
    );
  }
  const cached = cache.get(file);
  if (cached !== undefined) return cached;

  const html = readFileSync(path.join(TEMPLATES_DIR, file), "utf-8");
  cache.set(file, html);
  return html;
}
