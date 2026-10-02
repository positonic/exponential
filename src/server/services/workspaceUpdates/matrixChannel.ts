import type { PrismaClient } from "@prisma/client";

import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { buildTransactionId } from "~/server/services/matrix/postMeetingSummary";
import { markdownToPlainText } from "~/server/services/matrix/renderMeetingSummary";
import { resolveMatrixDestination } from "~/server/services/matrix/resolveMatrixDestination";
import { getMatrixClientForServer } from "~/server/services/matrix/matrixServer";

import { outcome, type ApprovedUpdate, type Channel } from "./distribute";
import { publicUpdatePath, stripLeadingHeadline } from "./public";
import { toChatMarkdown } from "./render";

/** The slice of MatrixClient the channel needs. */
export interface RoomSender {
  send(roomId: string, message: { html: string; text: string; txnId: string }): Promise<{ eventId: string }>;
}

export interface MatrixChannelDeps {
  /** Approved Markdown → sanitized HTML (Matrix renders a safe HTML subset). */
  renderHtml: (markdown: string) => string;
  baseUrl?: string;
  /** Override the client lookup (tests). */
  clientFor?: (serverIntegrationId: string, workspaceId: string) => Promise<RoomSender>;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The room message: a bold header line, the approved body, and a web link when public. */
export function renderRoomMessage(
  update: ApprovedUpdate,
  renderHtml: (markdown: string) => string,
  webUrl: string | null,
): { html: string; text: string } {
  // Chat clients render headings huge; the room gets bold lines instead.
  const body = toChatMarkdown(stripLeadingHeadline(update.body));
  const header = `${update.workspaceName} update: ${update.title}`;
  const html = [
    `<p><strong>${escapeHtml(header)}</strong></p>`,
    renderHtml(body),
    webUrl ? `<p><a href="${escapeHtml(webUrl)}">Read on the web</a></p>` : "",
  ].join("");
  const text = [header, markdownToPlainText(body), webUrl ?? ""].filter(Boolean).join("\n\n");
  return { html, text };
}

/**
 * Post an approved update to the workspace's team Matrix room: its outbound
 * ChannelLink default (`resolveMatrixDestination`, no project). The transaction
 * id is derived from the update and room, so a retried post after a timeout is
 * the same event, never a second copy — and once delivered, the distributor
 * never runs this channel again.
 */
export function createMatrixChannel(db: PrismaClient, deps: MatrixChannelDeps): Channel {
  const clientFor =
    deps.clientFor ??
    (async (serverIntegrationId: string, workspaceId: string) =>
      (await getMatrixClientForServer(db, serverIntegrationId, workspaceId)).client);

  return async (update: ApprovedUpdate) => {
    const destination = await resolveMatrixDestination(db, { projectId: null, workspaceId: update.workspaceId });
    if (destination.kind !== "room") return outcome("skipped", "no team Matrix room configured");
    const { link } = destination;
    if (!link.serverIntegrationId) return outcome("skipped", "the team room has no Matrix server");

    const baseUrl = deps.baseUrl ?? getPublicBaseUrlFromEnv();
    const webUrl = update.config.isPublic ? `${baseUrl}${publicUpdatePath(update.workspaceSlug, update.id)}` : null;
    const message = renderRoomMessage(update, deps.renderHtml, webUrl);

    const client = await clientFor(link.serverIntegrationId, update.workspaceId);
    const { eventId } = await client.send(link.externalId, {
      ...message,
      txnId: buildTransactionId(`update-${update.id}`, link.externalId, 0),
    });
    return outcome("done", `posted ${eventId}`);
  };
}
