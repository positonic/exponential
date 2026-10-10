import localFont from 'next/font/local';

/**
 * Inter, self-hosted from src/fonts (see the README there). Used for the
 * landing-page headings and the logo via Tailwind's `font-inter`.
 *
 * Deliberately `next/font/local`, not `next/font/google`: the Google loader
 * fetches the font inside `next build`, and that fetch was the only cause of
 * CI Build failures on main in the 30 days to 2026-10-10. A local font has
 * no network step anywhere — CI or Vercel.
 */
export const inter = localFont({
  src: '../fonts/inter-latin-wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});
