import type { SentryBugNotification } from "./sentryZulip";

/**
 * Post a Matrix message announcing a newly-filed Sentry bug, with deep links
 * to the created Ticket and back into Sentry. Sends via the raw Matrix
 * client-server API using a bot account's access token — no SDK, no session
 * state.
 *
 * Best-effort, mirroring sentryZulip: a silent no-op unless all three env
 * vars are set, and any send failure is swallowed so it can never break the
 * webhook. Called only when a *new* ticket was created (recurring errors that
 * dedup onto an existing ticket do not re-notify).
 *
 * The target room must be UNENCRYPTED — this posts plain events and cannot
 * participate in E2E encryption.
 *
 * Env:
 * - MATRIX_HOMESERVER_URL   e.g. https://matrix.syntro.fi
 * - MATRIX_BOT_ACCESS_TOKEN access token of the posting bot account
 * - MATRIX_SENTRY_ROOM_ID   internal room id (!abc123:syntro.fi), not an alias
 */
export async function notifyMatrixOfSentryBug(
  notification: SentryBugNotification,
): Promise<void> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL;
  const token = process.env.MATRIX_BOT_ACCESS_TOKEN;
  const roomId = process.env.MATRIX_SENTRY_ROOM_ID;
  if (!homeserver || !token || !roomId) return;

  try {
    const htmlLinks = [
      `<a href="${notification.ticketUrl}">Open ticket</a>`,
    ];
    const textLinks = [notification.ticketUrl];
    if (notification.sentryUrl) {
      htmlLinks.push(`<a href="${notification.sentryUrl}">View in Sentry</a>`);
      textLinks.push(notification.sentryUrl);
    }

    const body = `🐛 New Sentry bug: ${notification.title}\n${textLinks.join("\n")}`;
    const formattedBody = `🐛 <strong>New Sentry bug:</strong> ${escapeHtml(
      notification.title,
    )}<br/>${htmlLinks.join(" · ")}`;

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
        body,
        format: "org.matrix.custom.html",
        formatted_body: formattedBody,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[sentry webhook] Matrix notify failed: ${res.status} ${detail}`,
      );
    }
  } catch (error) {
    console.error("[sentry webhook] Matrix notify error:", error);
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
