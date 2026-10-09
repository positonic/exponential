/**
 * A `matrix.to` permalink for a room, usable from any Matrix client.
 *
 * Room ids look like `!opaque:server.name`. The `via` parameter names a server that
 * is in the room, which lets a client that has never seen the room find it; the
 * room's own server is always in it, so it is the safe default. Client-side only:
 * no network, no secrets.
 */
export function matrixRoomPermalink(roomId: string): string | null {
  const trimmed = roomId.trim();
  // Only real room ids (and aliases) get a link; the `off:<projectId>` placeholder
  // rows and anything malformed produce none rather than a dead link.
  if (!/^[!#][^:\s]+:[^\s]+$/.test(trimmed)) return null;

  const serverName = trimmed.slice(trimmed.indexOf(":") + 1);
  const params = trimmed.startsWith("!") ? `?via=${encodeURIComponent(serverName)}` : "";
  return `https://matrix.to/#/${encodeURIComponent(trimmed)}${params}`;
}
