import localFont from 'next/font/local';

/**
 * Fonts self-hosted from src/fonts (see the README there).
 *
 * Deliberately `next/font/local`, not `next/font/google`: the Google loader
 * fetches the font inside `next build`, and that fetch was the only cause of
 * CI Build failures on main in the 30 days to 2026-10-10. A local font has
 * no network step anywhere — CI or Vercel. Serving them from our own origin
 * also keeps them inside the CSP (`font-src 'self'`); the old Google Fonts
 * `@import`s in the coaching-home and auth-surface stylesheets tripped it on
 * every page.
 */

/** Landing-page headings, the logo (`font-inter`), and the auth + coaching surfaces. */
export const inter = localFont({
  src: '../fonts/inter-latin-wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

/** `--font-mono` / `--ch-font-mono`. Not preloaded: most pages never paint it. */
export const jetbrainsMono = localFont({
  src: '../fonts/jetbrains-mono-latin-wght.woff2',
  weight: '100 800',
  display: 'swap',
  preload: false,
  variable: '--font-jetbrains-mono',
});

/** `--ch-font-display`, the coaching home's serif headings. Not preloaded. */
export const fraunces = localFont({
  src: '../fonts/fraunces-latin-opsz-wght.woff2',
  weight: '100 900',
  display: 'swap',
  preload: false,
  variable: '--font-fraunces',
});

/** Every font variable above, for the `<html>` className of a root layout. */
export const fontVariables = `${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`;
