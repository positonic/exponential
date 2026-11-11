import type { SentryBugNotification } from "./sentryZulip";

/**
 * Post a message to the ops room — the Matrix room admins watch for bugs —
 * via the raw Matrix client-server API using a bot account's access token.
 * No SDK, no session state.
 *
 * Best-effort: returns false (and posts nothing) unless all three env vars are
 * set, and any send failure is logged and swallowed so a caller can never be
 * broken by it.
 *
 * The target room must be UNENCRYPTED — this posts plain events and cannot
 * participate in E2E encryption.
 *
 * Env:
 * - MATRIX_HOMESERVER_URL e.g. https://matrix.syntro.fi
 * - MATRIX_ACCESS_TOKEN   access token of the posting bot account (same
 *                         variable name the mastra gateway uses)
 * - MATRIX_SENTRY_ROOM_ID internal room id (!abc123:syntro.fi), not an alias
 */
export async function postMatrixOpsMessage(message: {
  /** Plain-text fallback. */
  body: string;
  /** HTML rendering; callers escape any untrusted text with {@link escapeHtml}. */
  formattedBody: string;
}): Promise<boolean> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL;
  const token = process.env.MATRIX_ACCESS_TOKEN;
  const roomId = process.env.MATRIX_SENTRY_ROOM_ID;
  if (!homeserver || !token || !roomId) return false;

  try {
    // PUT with a txn id makes retries idempotent on the homeserver side.
    const txnId = crypto.randomUUID();
    const url = `${homeserver.replace(/\/+$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(
      roomId,
    )}/send/m.room.message/${txnId}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: message.body,
        format: "org.matrix.custom.html",
        formatted_body: message.formattedBody,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[matrix ops] notify failed: ${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[matrix ops] notify error:", error);
    return false;
  }
}

/**
 * Announce a filed bug in the ops room, with deep links to the Ticket and
 * back into Sentry. Called when a ticket is created, and again for a repeat
 * alert (see `renotifyAfterMs` in SentryBugService).
 */
export async function notifyMatrixOfSentryBug(
  notification: SentryBugNotification,
): Promise<void> {
  const heading = notification.heading ?? "New Sentry bug";
  const htmlLinks = [`<a href="${notification.ticketUrl}">Open ticket</a>`];
  const textLinks = [notification.ticketUrl];
  if (notification.sentryUrl) {
    htmlLinks.push(`<a href="${notification.sentryUrl}">View in Sentry</a>`);
    textLinks.push(notification.sentryUrl);
  }

  await postMatrixOpsMessage({
    body: `🐛 ${heading}: ${notification.title}\n${textLinks.join("\n")}`,
    formattedBody: `🐛 <strong>${escapeHtml(heading)}:</strong> ${escapeHtml(
      notification.title,
    )}<br/>${htmlLinks.join(" · ")}`,
  });
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
