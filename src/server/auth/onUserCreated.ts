import { db } from "~/server/db";
import { acceptPendingInvitationsForUser } from "~/server/auth/acceptPendingInvitations";
import { sendFirstLoginWelcomeEmail } from "~/server/services/EmailService";
import { resolveWelcomeEmailContext, type WelcomeEmailContext } from "~/server/auth/welcomeEmailContext";

/**
 * Everything a brand-new user gets, once: `lastLogin`, a Personal workspace,
 * acceptance of pending invitations (the first one becomes their default
 * workspace) and the Welcome email.
 *
 * The body of Auth.js's `events.createUser`, which fires when the adapter
 * creates a user (OAuth, or a redeemed Sign-in code). Extracted so `/setup`,
 * which creates the instance admin itself rather than through the adapter,
 * gives that user the same start.
 */
export async function onUserCreated(user: { id?: string; email?: string | null; name?: string | null }): Promise<void> {
  if (!user.id) return;

  // Set lastLogin for newly created users
  await db.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Create personal workspace for new users
  let personalWorkspaceId: string | null = null;

  try {
    const slug = `personal-${user.id}`;
    const workspace = await db.workspace.create({
      data: {
        name: "Personal",
        slug,
        type: "personal",
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: "owner",
          },
        },
      },
    });

    personalWorkspaceId = workspace.id;

    // Set as default workspace
    await db.user.update({
      where: { id: user.id },
      data: { defaultWorkspaceId: workspace.id },
    });
  } catch (error) {
    // Log error but don't block user creation
    console.error("[Auth] Failed to create personal workspace:", error);
  }

  if (!user.email) return;

  // Prefer an invited workspace as the user's default so they land there
  // instead of their empty Personal workspace after sign-up.
  const firstAcceptedWorkspaceId = await acceptPendingInvitationsForUser(
    db,
    user.id,
    user.email
  );
  if (firstAcceptedWorkspaceId && firstAcceptedWorkspaceId !== personalWorkspaceId) {
    try {
      await db.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: firstAcceptedWorkspaceId },
      });
    } catch (error) {
      // Best-effort: landing in Personal instead of the invited workspace
      // must not cost the user their only Welcome email below.
      console.error("[Auth] Failed to set invited workspace as default:", error);
    }
  }

  // The Welcome email — the single onboarding email a user ever receives.
  // Sent from here because this event fires exactly once per user, after
  // the first successful sign-in on any provider; the sign-in code emails
  // stay minimal by design (see CONTEXT.md, "Welcome email"). Invited
  // users get a frame naming their first accepted workspace and inviter,
  // and the task-layer bullet names the chat tool that workspace actually
  // uses (resolved in `resolveWelcomeEmailContext`, which never throws).
  //
  // Awaited deliberately: this event runs inside the sign-in request on
  // Vercel, and a detached promise races the lambda freeze — the send
  // could silently never happen. The `.catch` still guarantees a failed
  // send can't block account creation. Not routed through
  // `reportHandledError` for the same Edge-bundle reason as in
  // `deliverSignInCode`.
  const context: WelcomeEmailContext = firstAcceptedWorkspaceId
    ? await resolveWelcomeEmailContext(db, firstAcceptedWorkspaceId, user.email)
    : {};

  await sendFirstLoginWelcomeEmail({
    to: user.email,
    name: user.name,
    invited: context.invited,
    chatTools: context.chatTools,
  }).catch((error) => {
    console.error("[Auth] Failed to send welcome email:", error);
  });
}
