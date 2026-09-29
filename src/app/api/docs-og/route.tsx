import { buildDocsNavigation, listDocPages } from "~/lib/docs/content";
import { getCurrentSection } from "~/lib/docs/navigation";
import { renderDocsOgImage } from "~/lib/docs/ogImage";

/**
 * GET /api/docs-og?path=/docs/meet/meetings — the Open Graph image for one
 * docs page. Only renders for paths that are real docs pages; anything else
 * gets the generic docs card.
 */
export function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "/docs";
  const pages = listDocPages();
  const page = pages.find((p) => p.href === path);
  if (!page) return renderDocsOgImage({ title: "Documentation", section: null });
  const section = page.href === "/docs" ? null : getCurrentSection(buildDocsNavigation(pages), page.href);
  return renderDocsOgImage({ title: page.meta.title, description: page.meta.description, section });
}

