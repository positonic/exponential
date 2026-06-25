/**
 * Resolve the in-app destination a notification should open when clicked.
 *
 * Pure and side-effect-free so it can drive every delivery surface from one
 * place: the web-push payload `url` (consumed by the service worker's
 * `notificationclick` handler) and any in-app row navigation. Returns an
 * app-relative path; unknown types fall back to "/".
 *
 * The `metadata` column is `Json?` but is written as a JSON *string* by some
 * producers (e.g. the Fireflies webhook), so both shapes are tolerated.
 */
export interface DeepLinkableNotification {
  type: string;
  metadata: unknown;
}

export function notificationDeepLink(notification: DeepLinkableNotification): string {
  const meta = parseMetadata(notification.metadata);

  switch (notification.type) {
    case "transcription_completed": {
      const id = typeof meta?.transcriptionId === "string" ? meta.transcriptionId : null;
      // Land on the meeting so the user can place it; fall back to the inbox.
      return id ? `/recording/${id}` : "/meetings";
    }
    default:
      return "/";
  }
}

function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }
  return null;
}
