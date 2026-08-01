/**
 * Compile-time regression guard for the 2026-07-30 integration-secrets audit:
 * no tRPC procedure may return an `IntegrationCredential` row — its `key`
 * column holds raw or encrypted secrets (Meta access tokens, API keys, bot
 * tokens).
 *
 * `LeakyProcedures` recursively walks every procedure's inferred output type
 * and collects any `"router.procedure"` whose payload contains a
 * credential-shaped object (`key` + `keyType` + `isEncrypted` together —
 * unique to IntegrationCredential in prisma/schema.prisma). Reintroducing
 * `credentials: true` into a returned payload makes `LeakyProcedures`
 * non-`never`, and the `AssertNever` line fails `npm run check` / CI with the
 * offending procedure names in the error message.
 *
 * This file is types-only: it emits no runtime code. The runtime companion
 * (deleted procedures stay deleted) lives in
 * `src/server/api/routers/__tests__/credentialExposure.test.ts` — test files
 * are excluded from tsc, which is why this guard cannot live there.
 */

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

type IsAny<T> = 0 extends 1 & T ? true : false;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type IsCredentialShaped<T> = T extends {
  key: unknown;
  keyType: unknown;
  isEncrypted: unknown;
}
  ? true
  : false;

type DeepFindsCredential<T, Depth extends unknown[] = []> = IsAny<T> extends true
  ? false
  : // Non-distributive never-check: a procedure that always throws has output
    // type `never`, and bare `never extends X` is vacuously true.
    [T] extends [never]
    ? false
    : Depth["length"] extends 10
    ? false
    : T extends Primitive | Date | ((...args: never[]) => unknown)
      ? false
      : T extends (infer U)[]
        ? DeepFindsCredential<U, [...Depth, 1]>
        : T extends object
          ? IsCredentialShaped<T> extends true
            ? true
            : true extends {
                  [K in keyof T]-?: DeepFindsCredential<T[K], [...Depth, 1]>;
                }[keyof T]
              ? true
              : false
          : false;

type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Union of `"router.procedure"` names whose output type contains an
 * IntegrationCredential-shaped object. Must stay `never`.
 */
export type LeakyProcedures = {
  [R in keyof RouterOutputs]: {
    [P in keyof RouterOutputs[R]]: DeepFindsCredential<RouterOutputs[R][P]> extends true
      ? `${R & string}.${P & string}`
      : never;
  }[keyof RouterOutputs[R]];
}[keyof RouterOutputs];

type AssertNever<T extends never> = T;

// If this line errors, the type argument names the procedures returning
// credential rows — remove `credentials` from their returned payloads.
export type NoProcedureReturnsCredentials = AssertNever<LeakyProcedures>;

/**
 * Canary: `DeepFindsCredential` must actually detect a credential-shaped
 * payload. Guards against the walk silently degrading (e.g. a tRPC upgrade
 * changing `inferRouterOutputs`) so the main assertion can't pass vacuously.
 */
type Canary = DeepFindsCredential<{
  integration: { credentials: { id: string; key: string; keyType: string; isEncrypted: boolean }[] };
}>;
type AssertTrue<T extends true> = T;
export type CredentialDetectionCanary = AssertTrue<Canary>;
