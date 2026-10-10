# Vendored fonts

Loaded through `next/font/local` from `src/lib/fonts.ts`, never fetched at
build time. `next/font/google` downloads from Google Fonts inside `next build`,
and that fetch was the single cause of every CI Build failure on `main` in the
30 days to 2026-10-10 (`An error occurred in next/font ... loader.js`). A local
font has no network step, on CI or on Vercel.

| File | Source | Licence |
| --- | --- | --- |
| `inter-latin-wght.woff2` | Google Fonts, Inter v20, latin subset, variable weight 100–900 (`fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2`) | SIL OFL 1.1, `LICENSE-Inter.txt` |

Geist (the body font) ships inside the `geist` npm package and needs nothing
here.
