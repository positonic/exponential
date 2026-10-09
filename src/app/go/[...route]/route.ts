import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { resolveGoWorkspaceSlug, sanitizeGoRoute } from "~/server/services/goLinks";

/**
 * `/go/<route>` — a workspace-agnostic link into a workspace-scoped page.
 *
 * `/go/goals` redirects to `/w/<slug>/goals` for the signed-in user's default
 * (or Personal) workspace, so docs, emails, chat messages and CLI help can
 * link a feature without knowing the reader's workspace. Signed out, it goes
 * to `/signin?callbackUrl=/go/<route>` so the link still works after login.
 * Query strings are carried through (`/go/projects?tab=tasks`).
 */
export async function GET(request: Request, context: { params: Promise<{ route: string[] }> }) {
  const { route } = await context.params;
  const url = new URL(request.url);
  const path = sanitizeGoRoute(route);
  if (!path) return NextResponse.redirect(new URL("/", url.origin));

  const target = `/go/${path}${url.search}`;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL(`/signin?callbackUrl=${encodeURIComponent(target)}`, url.origin));
  }

  const slug = await resolveGoWorkspaceSlug(db, session.user.id);
  if (!slug) return NextResponse.redirect(new URL("/workspaces", url.origin));

  return NextResponse.redirect(new URL(`/w/${slug}/${path}${url.search}`, url.origin));
}
