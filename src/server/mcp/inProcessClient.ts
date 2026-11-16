/**
 * An `ExponentialClient` that never leaves the process: its `fetch` hands each
 * tRPC request straight to the app's tRPC handler with a context the caller
 * has already resolved (hosted MCP Agent PRD, D4). There is no network hop and
 * no second authentication, and because the context is supplied here, `auth()`
 * is never consulted, so a session cookie can never authenticate a tool call.
 */

import { ExponentialClient } from "exponential-sdk";

import { handleTRPCRequest, type TRPCContext } from "~/server/api/fetchHandler";

/**
 * The client's base URL. `.invalid` never resolves (RFC 6761), so if a request
 * ever bypassed the in-process `fetch` it would fail rather than reach the
 * app's public address.
 */
export const IN_PROCESS_ORIGIN = "http://in-process.invalid";

export function createInProcessClient(context: TRPCContext): ExponentialClient {
  return new ExponentialClient({
    // Sent as a header the in-process handler never reads: the context below
    // is already resolved from the caller's real credential.
    token: "in-process",
    apiUrl: IN_PROCESS_ORIGIN,
    fetch: (input, init) => handleTRPCRequest(new Request(input, init), () => context),
  });
}
