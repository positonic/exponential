import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { canDelegateFromRole } from "~/lib/agentDelegation";
import { PRODUCT_NAME } from "~/lib/brand";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  authorizeErrorRedirect,
  authorizeParamsSchema,
  validateAuthorizeRequest,
} from "~/server/mcp/oauth/authorizeRequest";
import { describeRedirectTarget } from "~/server/mcp/oauth/clients";
import { mcpOAuthMode } from "~/server/mcp/oauth/metadata";
import { AuthorizeForm } from "./AuthorizeForm";
import "~/styles/auth-surface.css";

export const metadata: Metadata = {
  title: `Connect an app to ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Shell({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="auth-surface mkt">
      <header className="auth-header">
        <Link href="/" className="auth-header__brand">
          <Image src="/expo-logo-20.png" alt={`${PRODUCT_NAME} logo`} width={22} height={22} priority />
          <span>{PRODUCT_NAME}</span>
        </Link>
      </header>
      <div className="auth-shell">
        <section className="auth-left">
          <div className="auth-left__inner">
            <div className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              <span>{eyebrow}</span>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function Refused({ message }: { message: string }) {
  return (
    <Shell eyebrow="Connect an app">
      <h1 className="auth-title">This request can&apos;t continue</h1>
      <p className="auth-error" role="alert">
        {message}
      </p>
    </Shell>
  );
}

/**
 * The OAuth consent page for MCP clients (hosted MCP Agent PRD, D11). An app
 * that got a 401 from `/api/mcp` sends the person here; they choose which of
 * their External agents the app acts as, or set up a new one, and approve or
 * deny.
 *
 * Outside the `(sidemenu)` group and off the public route list: a signed-out
 * visitor is sent through sign-in by the middleware and returns to this same
 * request. The request is validated before anything renders; an unknown app or
 * an unregistered redirect gets an error page and is never redirected.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  // Per request: the mode, the session and the client are runtime state.
  await connection();
  const mode = mcpOAuthMode();
  if (mode === "off") notFound();

  const raw = await searchParams;
  const session = await auth();
  if (!session?.user) {
    // The middleware normally does this; kept so the page never renders signed out.
    const query = new URLSearchParams(
      Object.entries(raw).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
    );
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`);
  }

  // RFC 6749 §3.1: no parameter may appear twice.
  if (Object.values(raw).some((value) => Array.isArray(value))) {
    return <Refused message="This request repeats a parameter, so it was stopped. Start again from the app." />;
  }
  const params = authorizeParamsSchema.safeParse(raw);
  if (!params.success) {
    return <Refused message="This request is malformed, so it was stopped. Start again from the app." />;
  }

  const validation = await validateAuthorizeRequest(db, params.data);
  if (validation.kind === "invalid-client") return <Refused message={validation.message} />;
  if (validation.kind === "redirect-error") redirect(validation.redirectTo);
  const { request } = validation;

  const [agents, memberships] = await Promise.all([
    db.externalAgent.findMany({
      where: { ownerId: session.user.id, assistant: { is: null } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        shadowUser: { select: { workspaceMemberships: { select: { workspace: { select: { name: true } } } } } },
      },
    }),
    // The workspaces a new agent may be given: the server refuses any other.
    db.workspaceUser.findMany({
      where: { userId: session.user.id },
      select: { role: true, workspace: { select: { id: true, name: true, type: true } } },
    }),
  ]);
  const workspaces = memberships
    .filter((membership) => canDelegateFromRole(membership.role))
    .map(({ workspace }) => ({ id: workspace.id, name: workspace.name, isPersonal: workspace.type === "personal" }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name));

  return (
    <Shell eyebrow="Connect an app">
      <h1 className="auth-title">Connect {request.client.name}</h1>
      <AuthorizeForm
        request={params.data}
        clientName={request.client.name}
        returnTo={describeRedirectTarget(request.redirectUri)}
        agents={agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          workspaces: agent.shadowUser.workspaceMemberships.map((membership) => membership.workspace.name),
        }))}
        workspaces={workspaces}
        canApprove={mode === "on" || session.user.isAdmin}
        denyHref={authorizeErrorRedirect(
          request.redirectUri,
          "access_denied",
          "The person declined to connect this app.",
          request.state,
        )}
      />
    </Shell>
  );
}
