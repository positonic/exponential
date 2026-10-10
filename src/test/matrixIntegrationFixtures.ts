/**
 * Fixtures for the "a workspace-scoped Matrix row must not shadow the shared
 * gateway Integration" regression.
 *
 * The shared Matrix gateway (ADR-0043) is one system Integration row. Workspace-
 * registered Matrix homeservers are Integration rows too and they are *also*
 * `userId: null`, so any lookup that constrains only on `userId` can return a
 * workspace's server instead of the system row — silently rehoming every paired
 * user's DM mapping.
 *
 * `fakeIntegrationFindFirst` returns the first row matching every scalar key of the
 * `where` clause, over a table whose workspace-scoped rows come *first*. A lookup
 * that drops `workspaceId: null` therefore resolves the wrong row and the test fails.
 */

export const SYSTEM_MATRIX_INTEGRATION = {
  id: "int-matrix",
  name: "Matrix Gateway",
  provider: "matrix",
  status: "ACTIVE",
  userId: null,
  teamId: null,
  workspaceId: null,
};

/** A workspace-registered homeserver, in its intended shape. */
export const WORKSPACE_MATRIX_SERVER = {
  id: "int-matrix-server-ws",
  name: "CLEAR homeserver",
  provider: "matrix-server",
  status: "ACTIVE",
  userId: null,
  teamId: null,
  workspaceId: "ws-1",
};

/**
 * The pessimistic case: a workspace-scoped row that reuses the `matrix` provider.
 * Only the `workspaceId: null` constraint keeps this one out of the results, which
 * is why that constraint — not the distinct provider string — is the load-bearing half.
 */
export const WORKSPACE_MATRIX_SERVER_LEGACY_PROVIDER = {
  id: "int-matrix-legacy-ws",
  name: "Legacy workspace homeserver",
  provider: "matrix",
  status: "ACTIVE",
  userId: null,
  teamId: null,
  workspaceId: "ws-2",
};

/** Workspace rows first, so an unconstrained lookup picks the wrong one. */
export const MATRIX_INTEGRATION_TABLE = [
  WORKSPACE_MATRIX_SERVER,
  WORKSPACE_MATRIX_SERVER_LEGACY_PROVIDER,
  SYSTEM_MATRIX_INTEGRATION,
];

type Row = Record<string, unknown>;

export function fakeIntegrationFindFirst(rows: Row[] = MATRIX_INTEGRATION_TABLE) {
  return (args?: { where?: Row }) => {
    const where = args?.where ?? {};
    const match = rows.find((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    );
    return Promise.resolve(match ?? null);
  };
}
