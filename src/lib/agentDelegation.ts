/**
 * Workspace roles that may delegate access to an External agent (ADR-0049):
 * the owner must hold at least `member` themselves. An allowlist, because
 * `WorkspaceUser.role` is a free string — a role added later must not become
 * delegable by default.
 *
 * Shared by the server's grant check and the settings pickers, so the UI never
 * offers a workspace the server will refuse.
 */
export const DELEGATING_WORKSPACE_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "member",
]);

export function canDelegateFromRole(role: string | null | undefined): boolean {
  return role != null && DELEGATING_WORKSPACE_ROLES.has(role);
}
