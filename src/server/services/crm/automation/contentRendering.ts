/**
 * Shared rendering for **user-authored** Automation step content — the welcome
 * email body/subject and the agreement title/body edited in the builder
 * (CONTEXT.md → Automation builder). Authored as plain text with `{{variable}}`
 * tokens; rendered to safe HTML (escaped) for email/agreement output.
 *
 * Distinct from `templateRenderer.renderTemplate`, which substitutes into
 * *trusted* built-in HTML templates and does NOT escape. User text must be
 * escaped to stay injection-safe, so it lives here. Pure — unit-tested.
 */

export interface ContactForTemplate {
  firstName: string | null;
  lastName: string | null;
  organization?: { name: string | null } | null;
}

/** The variables a step's content can reference. */
export function buildContactTemplateData(
  contact: ContactForTemplate,
  customerType: string,
  now: Date,
): Record<string, string> {
  const fullName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    "there";
  return {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    fullName,
    customerType,
    companyName: contact.organization?.name ?? "",
    date: now.toISOString().slice(0, 10),
  };
}

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Substitute `{{vars}}` into a single line (no HTML). For subjects/titles. */
export function renderInline(
  template: string,
  data: Record<string, string>,
): string {
  return template.replace(TOKEN, (_m, key: string) => data[key.trim()] ?? "");
}

/**
 * Escape user text, substitute `{{vars}}` (values also escaped), and turn
 * blank-line breaks into `<p>` and single newlines into `<br/>`. Injection-safe:
 * any HTML the user typed is escaped, so a raw `{{token}}` never leaks and no
 * markup the user types is executed.
 */
export function renderTextBodyToHtml(
  template: string,
  data: Record<string, string>,
): string {
  const substituted = escapeHtml(template).replace(
    TOKEN,
    (_m, key: string) => escapeHtml(data[key.trim()] ?? ""),
  );
  return substituted
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

/** Plain-text body: substitute `{{vars}}`, no escaping. For the email text part. */
export function renderTextBodyToPlain(
  template: string,
  data: Record<string, string>,
): string {
  return renderInline(template, data);
}

/** Wrap a user-authored agreement body in a minimal, color-free HTML document. */
export function wrapAgreementHtml(title: string, bodyHtml: string): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
  </head>
  <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; max-width: 720px; margin: 0 auto; padding: 40px;">
    <h1 style="font-size: 22px;">${safeTitle}</h1>
    ${bodyHtml}
    <p style="margin-top: 48px;">[DIGITAL SIGNATURE FIELD]</p>
  </body>
</html>`;
}
