/**
 * Double-opt-in signup for a workspace's update newsletter (ADR-0064, V3).
 *
 * 1. `requestSubscription`: a visitor submits their email on the public
 *    updates page; we email them a signed confirmation link. Nothing is stored:
 *    the token is the pending signup.
 * 2. `confirmSubscription`: following the link (and pressing Confirm) creates
 *    or reuses the workspace's CRM contact for that email and adds it to the
 *    newsletter List. Confirming is an explicit consent, so it clears an
 *    opt-out from *before* the signup was requested; an unsubscribe made after
 *    it wins, so replaying an old link never re-subscribes anyone.
 *
 * Both steps need signups to be open: a public updates page and a newsletter
 * List that still exists.
 */
import type { PrismaClient } from "@prisma/client";

import { CollectionService } from "~/server/services/collections/CollectionService";
import { createMemberTypeRegistry } from "~/server/services/collections/createMemberTypeRegistry";
import { dispatchListMemberAddedAutomations } from "~/server/services/crm/automation/dispatchListMemberAddedAutomations";
import { createCrmContact } from "~/server/services/crm/createCrmContact";

import { findNewsletterList } from "./newsletterList";
import { publicUpdatesPath } from "./public";
import { signSubscribeToken, verifySubscribeToken } from "./subscribeToken";

/** CrmContact.importSource for contacts created by a confirmed signup. */
export const UPDATE_SIGNUP_SOURCE = "UPDATES_SIGNUP";

export interface ConfirmationEmail {
  to: string;
  workspaceName: string;
  confirmUrl: string;
  workspaceId: string;
}

export interface RequestSubscriptionDeps {
  sendConfirmation: (email: ConfirmationEmail) => Promise<void>;
  baseUrl: string;
}

export type RequestSubscriptionResult = { kind: "sent" } | { kind: "unavailable" };

/** Where a confirmation link lands: a page with a Confirm button (see the route). */
export function confirmPath(workspaceSlug: string, token: string): string {
  return `${publicUpdatesPath(workspaceSlug)}/confirm?token=${encodeURIComponent(token)}`;
}

async function loadSignupWorkspace(db: PrismaClient, where: { slug: string } | { id: string }) {
  const workspace = await db.workspace.findUnique({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      updateConfig: { select: { isPublic: true, newsletterCollectionId: true } },
    },
  });
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    isPublic: workspace.updateConfig?.isPublic ?? false,
    collectionId: workspace.updateConfig?.newsletterCollectionId ?? null,
  };
}

/** Signups are open on a public updates page whose newsletter List still exists. */
async function openSignupList(
  db: PrismaClient,
  workspace: { id: string; isPublic: boolean; collectionId: string | null },
): Promise<{ id: string } | null> {
  if (!workspace.isPublic) return null;
  return findNewsletterList(db, workspace.id, workspace.collectionId);
}

export async function requestSubscription(
  db: PrismaClient,
  input: { workspaceSlug: string; email: string },
  deps: RequestSubscriptionDeps,
): Promise<RequestSubscriptionResult> {
  const workspace = await loadSignupWorkspace(db, { slug: input.workspaceSlug });
  if (!workspace || !(await openSignupList(db, workspace))) return { kind: "unavailable" };

  const token = signSubscribeToken(workspace.id, input.email);
  await deps.sendConfirmation({
    to: input.email,
    workspaceName: workspace.name,
    confirmUrl: `${deps.baseUrl}${confirmPath(workspace.slug, token)}`,
    workspaceId: workspace.id,
  });
  return { kind: "sent" };
}

/** What a confirmation link is for, so the page can show it before the visitor confirms. */
export async function previewSubscription(
  db: PrismaClient,
  token: string,
): Promise<{ workspaceName: string; workspaceSlug: string; email: string } | null> {
  const signup = verifySubscribeToken(token);
  if (!signup) return null;
  const workspace = await loadSignupWorkspace(db, { id: signup.workspaceId });
  if (!workspace) return null;
  return { workspaceName: workspace.name, workspaceSlug: workspace.slug, email: signup.email };
}

export type ConfirmSubscriptionResult =
  | { kind: "subscribed"; workspaceSlug: string; workspaceName: string; alreadySubscribed: boolean }
  /** The workspace no longer has a newsletter List to join. */
  | { kind: "closed"; workspaceSlug: string; workspaceName: string }
  /** Tampered or expired, or the address unsubscribed after this link was sent. */
  | { kind: "invalid" };

export async function confirmSubscription(db: PrismaClient, token: string): Promise<ConfirmSubscriptionResult> {
  const signup = verifySubscribeToken(token);
  if (!signup) return { kind: "invalid" };
  const workspace = await loadSignupWorkspace(db, { id: signup.workspaceId });
  if (!workspace) return { kind: "invalid" };

  // Checked again at confirm time: the token outlives the settings, and an
  // owner who closed signups (or deleted the List) meant it.
  const collection = await openSignupList(db, workspace);
  if (!collection) return { kind: "closed", workspaceSlug: workspace.slug, workspaceName: workspace.name };

  const { contactId } = await createCrmContact(db, {
    workspaceId: workspace.id,
    email: signup.email,
    importSource: UPDATE_SIGNUP_SOURCE,
  });
  // Confirming is a fresh consent, so it lifts an unsubscribe from before the
  // signup was requested. One made after it wins: the link is spent.
  await db.crmContact.updateMany({
    where: { id: contactId, emailOptedOutAt: { lt: signup.requestedAt } },
    data: { emailOptedOutAt: null },
  });
  const contact = await db.crmContact.findUnique({ where: { id: contactId }, select: { emailOptedOutAt: true } });
  if (contact?.emailOptedOutAt) return { kind: "invalid" };

  const { addedMemberIds } = await new CollectionService(db, createMemberTypeRegistry(db)).addMembers(collection.id, [
    contactId,
  ]);
  if (addedMemberIds.length > 0) {
    // A welcome Automation on the List is a bonus; the signup stands without it.
    await dispatchListMemberAddedAutomations(db, {
      collectionId: collection.id,
      workspaceId: workspace.id,
      addedMemberIds,
    }).catch((err: unknown) => {
      console.error("[workspaceUpdates.subscribe] list automation dispatch failed", err);
    });
  }

  return {
    kind: "subscribed",
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    alreadySubscribed: addedMemberIds.length === 0,
  };
}
