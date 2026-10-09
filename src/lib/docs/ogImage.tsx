import { ImageResponse } from "next/og";
import { colorTokens } from "~/styles/colors";
import { PRODUCT_NAME } from "~/lib/brand";

export const OG_SIZE = { width: 1200, height: 630 };

const dark = colorTokens.dark;

/**
 * The Open Graph card for a docs page: section, title, description and the
 * product name, in the dark theme's tokens. Shared by the docs index and
 * every docs page's `opengraph-image`.
 */
export function renderDocsOgImage(opts: { title: string; description?: string; section?: string | null }) {
  const description =
    opts.description && opts.description.length > 180 ? `${opts.description.slice(0, 177)}…` : opts.description;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: dark.background.primary,
          borderTop: `12px solid ${dark.brand.primary}`,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 2, textTransform: "uppercase", color: dark.brand.primaryHover }}>
            {opts.section ? `Docs · ${opts.section}` : "Docs"}
          </div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.1, color: dark.text.primary }}>
            {opts.title}
          </div>
          {description ? (
            <div style={{ display: "flex", fontSize: 32, lineHeight: 1.4, color: dark.text.secondary }}>{description}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: dark.text.muted }}>{PRODUCT_NAME}</div>
      </div>
    ),
    OG_SIZE,
  );
}

/** Relative URL of a docs page's OG image (resolved against metadataBase). */
export function docsOgImageUrl(href: string): string {
  return `/api/docs-og?path=${encodeURIComponent(href)}`;
}
