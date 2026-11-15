/**
 * A workspace's own Anthropic API key (bring-your-own-key).
 *
 * With a working key saved, the workspace's Assistant runs on it and its
 * turns are never counted against the assistant allowance. The key lives in
 * the existing secret store, not a table of its own: one
 * `Integration { type: "model_key", provider: "anthropic", workspaceId }` with
 * one encrypted `IntegrationCredential`. What may be shown again is kept
 * beside it in `providerConfig`: the last four characters and whether the key
 * still works. The key itself is read back only by `getWorkingModelKey`, for
 * the Mastra server.
 *
 * Nothing here logs or returns the key.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma, PrismaClient } from "@prisma/client";

import { encryptCredential, getDecryptedKey } from "~/server/utils/credentialHelper";

export const MODEL_KEY_INTEGRATION_TYPE = "model_key";
export const MODEL_KEY_PROVIDER = "anthropic";
const MODEL_KEY_CREDENTIAL_TYPE = "API_KEY";

export type ModelKeyState = "valid" | "failing";

/** What the app may show about a saved key. Never the key. */
export interface ModelKeyStatus {
  last4: string;
  status: ModelKeyState;
  checkedAt: Date;
}

export type ModelKeyValidation =
  | { ok: true }
  | {
      ok: false;
      /** `rejected`: Anthropic refused the key. `unreachable`: it could not be checked at all. */
      reason: "rejected" | "unreachable";
      message: string;
    };

/** Calls Anthropic with the key. Throws the SDK's typed errors. */
export type ModelKeyProbe = (apiKey: string) => Promise<void>;

const VALIDATION_TIMEOUT_MS = 10_000;

/** Lists one model: the cheapest call that proves a key is accepted. No tokens are spent. */
const probeAnthropic: ModelKeyProbe = async (apiKey) => {
  // Built per call, never at module scope (noModuleScopeLlmClients.test.ts).
  const client = new Anthropic({ apiKey, timeout: VALIDATION_TIMEOUT_MS, maxRetries: 0 });
  await client.models.list({ limit: 1 });
};

/** Check a key with Anthropic, saying what failed when it is not usable. */
export async function validateAnthropicKey(
  apiKey: string,
  probe: ModelKeyProbe = probeAnthropic,
): Promise<ModelKeyValidation> {
  try {
    await probe(apiKey);
    return { ok: true };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, reason: "rejected", message: "That key was rejected by Anthropic" };
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return {
        ok: false,
        reason: "rejected",
        message: "Anthropic accepted that key but it is not allowed to list models. Check the key's permissions.",
      };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        reason: "unreachable",
        message: "Anthropic is rate-limiting that key right now. Try again in a minute.",
      };
    }
    return {
      ok: false,
      reason: "unreachable",
      message: "Could not reach Anthropic to check the key. Try again in a moment.",
    };
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

const modelKeyWhere = (workspaceId: string) => ({
  workspaceId,
  type: MODEL_KEY_INTEGRATION_TYPE,
  provider: MODEL_KEY_PROVIDER,
});

function parseStatus(providerConfig: unknown): ModelKeyStatus | null {
  if (typeof providerConfig !== "object" || providerConfig === null) return null;
  const config = providerConfig as Record<string, unknown>;
  if (typeof config.last4 !== "string") return null;
  const checkedAt = typeof config.checkedAt === "string" ? new Date(config.checkedAt) : new Date(0);
  return {
    last4: config.last4,
    status: config.status === "failing" ? "failing" : "valid",
    checkedAt,
  };
}

function statusConfig(last4: string, status: ModelKeyState, checkedAt: Date): Prisma.InputJsonValue {
  return { last4, status, checkedAt: checkedAt.toISOString() };
}

/** The saved key's last four characters and state, or null when the workspace has none. */
export async function getModelKeyStatus(
  db: Pick<PrismaClient, "integration">,
  workspaceId: string,
): Promise<ModelKeyStatus | null> {
  const integration = await db.integration.findFirst({
    where: modelKeyWhere(workspaceId),
    select: { providerConfig: true },
  });
  return integration ? parseStatus(integration.providerConfig) : null;
}

/**
 * Store a key that has already been validated, replacing any key the
 * workspace had. Encrypted at rest; a missing encryption key throws rather
 * than storing plaintext.
 *
 * The integration row belongs to the workspace alone (no `userId`, no
 * `teamId`): it must not disappear with the account of whoever pasted the
 * key, and it stays out of every "my integrations" and team list, which
 * select by those two columns.
 */
export async function saveModelKey(
  db: PrismaClient,
  input: { workspaceId: string; apiKey: string; now?: Date },
): Promise<ModelKeyStatus> {
  const now = input.now ?? new Date();
  const last4 = input.apiKey.slice(-4);
  const encrypted = encryptCredential(input.apiKey);

  await db.$transaction(async (tx) => {
    // One key per workspace: a new one replaces the old integration whole,
    // so no stale credential row can outlive it.
    await tx.integration.deleteMany({ where: modelKeyWhere(input.workspaceId) });
    await tx.integration.create({
      data: {
        name: "Anthropic API key",
        type: MODEL_KEY_INTEGRATION_TYPE,
        provider: MODEL_KEY_PROVIDER,
        status: "ACTIVE",
        workspaceId: input.workspaceId,
        providerConfig: statusConfig(last4, "valid", now),
        credentials: {
          create: {
            key: encrypted.key,
            keyType: MODEL_KEY_CREDENTIAL_TYPE,
            isEncrypted: encrypted.isEncrypted,
          },
        },
      },
    });
  });

  return { last4, status: "valid", checkedAt: now };
}

/**
 * Mark the workspace's key as no longer working, so `getWorkingModelKey`
 * stops handing it out and the Assistant falls back to the hosted key.
 * Returns the key's status when this call is what changed it, and null when
 * there is no key or it was already marked: a burst of failing turns then
 * tells owners once, not once per turn. Saving a key again clears it.
 */
export async function markModelKeyFailing(
  db: Pick<PrismaClient, "integration">,
  workspaceId: string,
  now: Date = new Date(),
): Promise<ModelKeyStatus | null> {
  const integration = await db.integration.findFirst({
    where: modelKeyWhere(workspaceId),
    select: { id: true, providerConfig: true },
  });
  const current = integration ? parseStatus(integration.providerConfig) : null;
  if (!integration || !current || current.status === "failing") return null;

  await db.integration.update({
    where: { id: integration.id },
    data: { providerConfig: statusConfig(current.last4, "failing", now) },
  });
  return { last4: current.last4, status: "failing", checkedAt: now };
}

/**
 * Delete the workspace's key (the credential row goes with its integration).
 * The Assistant goes back to the hosted key and the monthly allowance.
 * Returns false when there was no key to remove.
 */
export async function removeModelKey(db: Pick<PrismaClient, "integration">, workspaceId: string): Promise<boolean> {
  const removed = await db.integration.deleteMany({ where: modelKeyWhere(workspaceId) });
  return removed.count > 0;
}

/**
 * The workspace's key, decrypted, when it has one that works. Null when
 * there is no key, when it has been marked as failing, or when it cannot be
 * decrypted: callers then fall back to the hosted key.
 */
export async function getWorkingModelKey(db: Db, workspaceId: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: modelKeyWhere(workspaceId),
    select: {
      providerConfig: true,
      credentials: {
        where: { keyType: MODEL_KEY_CREDENTIAL_TYPE },
        select: { key: true, isEncrypted: true },
        take: 1,
      },
    },
  });
  const credential = integration?.credentials[0];
  if (!integration || !credential) return null;
  if (parseStatus(integration.providerConfig)?.status === "failing") return null;
  return getDecryptedKey(credential);
}
