# Vendored fonts

Loaded through `next/font/local` from `src/lib/fonts.ts`, never fetched at
build time. `next/font/google` downloads from Google Fonts inside `next build`,
and that fetch was the single cause of every CI Build failure on `main` in the
30 days to 2026-10-10 (`An error occurred in next/font ... loader.js`). A local
font has no network step, on CI or on Vercel.

| File | Source | Licence |
| --- | --- | --- |
| `inter-latin-wght.woff2` | Google Fonts, Inter v20, latin subset, variable weight 100–900 (`fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2`) | SIL OFL 1.1, `LICENSE-Inter.txt` |
| `jetbrains-mono-latin-wght.woff2` | Google Fonts, JetBrains Mono v24, latin subset, variable weight 100–800 (`fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD7OwGtT0rU.woff2`) | SIL OFL 1.1, `LICENSE-JetBrainsMono.txt` |
| `fraunces-latin-opsz-wght.woff2` | Google Fonts, Fraunces v38, latin subset, variable optical size 9–144 and weight 100–900 (`fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2`) | SIL OFL 1.1, `LICENSE-Fraunces.txt` |

Never `@import` a stylesheet from `fonts.googleapis.com` either: the CSP's
`style-src` and `font-src` allow only our own origin, so a Google Fonts import
is reported as a violation on every page that loads the stylesheet. Add the
woff2 here and a `localFont` entry to `src/lib/fonts.ts` instead.

Geist (the body font) ships inside the `geist` npm package and needs nothing
here.
