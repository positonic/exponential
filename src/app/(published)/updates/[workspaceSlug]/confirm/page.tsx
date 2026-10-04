import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { db } from "~/server/db";
import { getPublicWorkspace, publicUpdatesPath } from "~/server/services/workspaceUpdates/public";
import { previewSubscription } from "~/server/services/workspaceUpdates/subscribe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false, follow: false } };

type Params = {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ token?: string | string[]; status?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Panel({ title, children, backHref }: { title: string; children: ReactNode; backHref?: string | null }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="mb-3 text-2xl font-bold text-text-primary">{title}</h1>
      <div className="text-text-secondary">{children}</div>
      {backHref && (
        <p className="mt-8 text-sm">
          <Link href={backHref} className="text-text-muted hover:text-text-primary">
            ← Back to updates
          </Link>
        </p>
      )}
    </main>
  );
}

/**
 * Where the confirmation email's link lands. Following the link does nothing
 * by itself (mail scanners open links too); the visitor presses Confirm, which
 * posts the token to `/api/updates/[workspaceSlug]/confirm`, and comes back
 * here with `?status=`.
 */
export default async function ConfirmSubscriptionPage({ params, searchParams }: Params) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const status = first(query.status);
  const token = first(query.token);

  // Only a public workspace is named or linked to: the slug in the URL is
  // untrusted, so a private workspace's name never shows here.
  const publicWorkspace = await getPublicWorkspace(db, workspaceSlug);
  const backHref = publicWorkspace ? publicUpdatesPath(publicWorkspace.slug) : null;
  const updatesOf = publicWorkspace ? `${publicWorkspace.name} updates` : "these updates";

  if (status === "subscribed") {
    return (
      <Panel title="You're subscribed" backHref={backHref}>
        You&apos;ll get {updatesOf} by email. Every email has an unsubscribe link.
      </Panel>
    );
  }
  if (status === "already") {
    return (
      <Panel title="You're already subscribed" backHref={backHref}>
        This address already gets {updatesOf}. Nothing else to do.
      </Panel>
    );
  }
  if (status === "closed") {
    return (
      <Panel title="Signups are closed" backHref={backHref}>
        {publicWorkspace ? publicWorkspace.name : "This workspace"} isn&apos;t taking email subscribers right now.
      </Panel>
    );
  }
  if (status === "busy") {
    return (
      <Panel title="Too many attempts" backHref={backHref}>
        Please wait a few minutes, then open the link in your email again.
      </Panel>
    );
  }

  const preview = token && status !== "invalid" ? await previewSubscription(db, token) : null;
  if (!token || !preview) {
    return (
      <Panel title="This link has expired" backHref={backHref}>
        The confirmation link is invalid or more than 7 days old.
        {backHref ? " Sign up again on the updates page to get a new one." : ""}
      </Panel>
    );
  }

  return (
    <Panel title="Confirm your subscription" backHref={backHref}>
      <p>
        Subscribe <strong className="text-text-primary">{preview.email}</strong> to {preview.workspaceName} updates?
      </p>
      <form method="post" action={`/api/updates/${encodeURIComponent(preview.workspaceSlug)}/confirm`} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-md bg-brand-primary px-4 py-2 font-semibold text-text-inverse hover:opacity-90"
        >
          Confirm subscription
        </button>
      </form>
    </Panel>
  );
}
