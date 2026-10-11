import type { Prisma, PrismaClient } from "@prisma/client";
import { fileImportIntoDefaultWorkspace } from "./assignMeetingPlacement";

/**
 * The Fireflies integration's "File new meetings into" setting: the Workspace
 * its imports land in instead of Personal. Stored in `providerConfig`, not in
 * `Integration.workspaceId` — that column makes an integration
 * workspace-owned (managed by the Workspace's admins), and this one stays the
 * owner's own.
 */
const CONFIG_KEY = "meetingWorkspaceId";

/** The configured default Workspace id, or null when unset or malformed. */
export function readFirefliesMeetingWorkspaceId(
  providerConfig: Prisma.JsonValue | null | undefined,
): string | null {
  if (!providerConfig || typeof providerConfig !== "object" || Array.isArray(providerConfig)) {
    return null;
  }
  const value = providerConfig[CONFIG_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `providerConfig` with the default Workspace set, or removed when null. */
export function withFirefliesMeetingWorkspaceId(
  providerConfig: Prisma.JsonValue | null | undefined,
  workspaceId: string | null,
): Prisma.InputJsonObject {
  const base: Prisma.JsonObject =
    providerConfig && typeof providerConfig === "object" && !Array.isArray(providerConfig)
      ? { ...providerConfig }
      : {};
  if (workspaceId) base[CONFIG_KEY] = workspaceId;
  else delete base[CONFIG_KEY];
  return base as Prisma.InputJsonObject;
}

/**
 * After a Fireflies import is created (and ceremony auto-attach has had its
 * turn), file it into the integration's default Workspace if one is set.
 * Never throws: a failure leaves the Meeting in Personal, exactly as before
 * this setting existed, and must not fail the import.
 */
export async function fileFirefliesImport(
  db: PrismaClient,
  input: { meetingId: string; ownerUserId: string; integrationId: string },
): Promise<string | null> {
  try {
    const integration = await db.integration.findUnique({
      where: { id: input.integrationId },
      select: { providerConfig: true },
    });
    return await fileImportIntoDefaultWorkspace(db, {
      meetingId: input.meetingId,
      ownerUserId: input.ownerUserId,
      workspaceId: readFirefliesMeetingWorkspaceId(integration?.providerConfig),
    });
  } catch (error) {
    console.error(
      `[fileFirefliesImport] Could not file meeting ${input.meetingId} into its default workspace:`,
      error,
    );
    return null;
  }
}
