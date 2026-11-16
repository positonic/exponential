/**
 * The NextAuth `redirect` callback's logic, as a pure function.
 *
 * Always returns an **absolute** URL. `next-auth/react`'s `signIn({ redirect:
 * false })` runs `new URL(data.url)` on whatever this returns, with no base — a
 * bare "/home" throws `TypeError: "/home" cannot be parsed as a URL` (Sentry
 * EXPONENTIAL-FRONTEND-P, on /desktop-auth: the desktop shells' callbackUrl is
 * not on `baseUrl`'s origin, so it fell through to the relative default).
 */
export function resolveAuthRedirect(url: string, baseUrl: string): string {
  if (url.startsWith("/")) return `${baseUrl}${url}`;
  try {
    if (new URL(url).origin === baseUrl) return url;
  } catch {
    // Unparseable callbackUrl — fall through to the default.
  }
  // Foreign origin: never redirect off-site. Onboarding is checked in pages.
  return `${baseUrl}/home`;
}
