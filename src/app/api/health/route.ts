import { NextResponse } from "next/server";

// Always evaluate at request time so the reported SHA reflects the running
// deployment, never a cached build.
export const dynamic = "force-dynamic";

/**
 * Lightweight deploy-verification endpoint.
 *
 * Returns the git commit the running deployment was built from, so we can
 * confirm *what* is live without guessing. On Vercel, `VERCEL_GIT_COMMIT_SHA`
 * is injected at build + runtime; locally it's usually unset.
 *
 * GET /api/health  →  { status, commit, branch, builtAt? }
 */
export function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    "unknown";

  return NextResponse.json({
    status: "ok",
    commit,
    shortCommit: commit === "unknown" ? "unknown" : commit.slice(0, 8),
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
  });
}
