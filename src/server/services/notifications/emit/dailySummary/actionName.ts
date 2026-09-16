import { stripHtml } from "~/lib/utils";

/**
 * Action names written in the legacy rich-text editor can carry HTML — a pasted
 * link is stored as `<a href="…">label</a>`. Every renderer of the digest
 * (Markdown, plain text, speech) expects Markdown, so a link becomes
 * `[label](url)` and any other tag is dropped. Names without tags pass through
 * untouched, so ordinary punctuation is never escaped.
 */
export function actionNameMarkdown(name: string): string {
  if (!/<\/?[a-z][^>]*>/i.test(name)) return name;
  const linked = name.replace(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) =>
      `[${stripHtml(label) || href}](${href})`,
  );
  return stripHtml(linked);
}
