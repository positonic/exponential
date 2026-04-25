/* eslint-disable no-restricted-syntax */
// Web App Manifest spec requires real color values (CSS variables unsupported),
// so we inline the brand navy hex here. White-label builds override via env.

import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "~/lib/brand";

const DEFAULT_THEME_COLOR = "#0c1022"; // eslint-disable-line no-restricted-syntax -- PWA manifest theme-color spec requires a literal hex

export function GET() {
  const themeColor =
    process.env.NEXT_PUBLIC_MANIFEST_THEME_COLOR ?? DEFAULT_THEME_COLOR;
  const backgroundColor =
    process.env.NEXT_PUBLIC_MANIFEST_BACKGROUND_COLOR ?? DEFAULT_THEME_COLOR;

  const manifest = {
    name: PRODUCT_NAME,
    short_name: PRODUCT_SHORT_NAME,
    start_url: "/",
    display: "standalone",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    theme_color: themeColor,
    background_color: backgroundColor,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
