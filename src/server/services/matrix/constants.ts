/**
 * A workspace-registered Matrix homeserver is an `Integration` row, and it is
 * deliberately NOT `provider: "matrix"`.
 *
 * `"matrix"` is the single system row anchoring Gateway DM pairing (ADR-0043). A
 * workspace server is a different thing entirely — its own homeserver, its own bot,
 * poster-only. Sharing the provider string would put both behind the same lookups.
 *
 * The distinct string is only half the separation; the other half is
 * `SHARED_MATRIX_INTEGRATION_WHERE`'s `workspaceId: null`, which holds even if a
 * workspace row ever appears under the `matrix` provider.
 */
export const MATRIX_SERVER_PROVIDER = "matrix-server";

/** `IntegrationCredential.keyType` for the bot's access token. Always encrypted. */
export const MATRIX_ACCESS_TOKEN_KEY_TYPE = "matrix_access_token";

/** Aliases accepted when reading the token back, in priority order. */
export const MATRIX_ACCESS_TOKEN_ALIASES = [
  MATRIX_ACCESS_TOKEN_KEY_TYPE,
  "MATRIX_ACCESS_TOKEN",
] as const;

/** Shape stored in `Integration.providerConfig` for a registered server. */
export interface MatrixServerConfig {
  homeserverUrl: string;
  botUserId: string;
}

/**
 * `ChannelLink.provider` for a Matrix room binding.
 *
 * Note this is `"matrix"`, not `MATRIX_SERVER_PROVIDER` — a ChannelLink names the
 * *chat platform* the room is on, alongside `"whatsapp"` and `"slack"`, whereas an
 * Integration's provider names the kind of credential. The two namespaces are separate.
 */
export const MATRIX_CHANNEL_PROVIDER = "matrix";
