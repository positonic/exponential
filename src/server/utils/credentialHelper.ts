import {
  encryptToBase64,
  decryptFromBase64Result,
  isEncryptionAvailable,
  type DecryptResult,
} from './encryption';

/**
 * Helper for managing integration credentials with encryption support.
 * Handles backwards compatibility for existing plaintext credentials.
 */

/**
 * Encrypt a credential value for storage. Encryption is MANDATORY: a missing
 * or invalid DATABASE_ENCRYPTION_KEY throws rather than silently degrading to
 * plaintext (the old fallback meant a misconfigured deploy stored every
 * secret in the clear — see the 2026-07-30 integration-secrets audit).
 */
export function encryptCredential(plaintext: string): { key: string; isEncrypted: boolean } {
  if (!isEncryptionAvailable()) {
    throw new Error(
      'DATABASE_ENCRYPTION_KEY is not set — refusing to store a credential in plaintext. ' +
        'Set a 32-byte key (raw or base64) in the environment.',
    );
  }

  // encryptToBase64 throws on an invalid key or cipher failure — let it
  // propagate; a failed write is the correct outcome.
  const encrypted = encryptToBase64(plaintext);
  return { key: encrypted, isEncrypted: true };
}

/**
 * Decrypt a credential value, reporting WHY on failure.
 * Handles both encrypted and plaintext credentials based on isEncrypted flag.
 */
export function decryptCredentialResult(key: string, isEncrypted: boolean): DecryptResult {
  if (!isEncrypted) {
    // Plaintext credential (legacy) — the flag decides, never the caller.
    return { ok: true, value: key };
  }
  return decryptFromBase64Result(key);
}

/**
 * Decrypt a credential value, collapsing failures to null (after logging the
 * reason). Prefer decryptCredentialResult where the caller can surface the
 * distinction — an `auth_failed` here usually means a wrong or rotated
 * DATABASE_ENCRYPTION_KEY, which must be alertable, not mistaken for an
 * unconfigured integration.
 */
export function decryptCredential(key: string, isEncrypted: boolean): string | null {
  const result = decryptCredentialResult(key, isEncrypted);
  if (!result.ok) {
    console.error(
      `[credentialHelper] Failed to decrypt credential (reason: ${result.reason})` +
        (result.reason === 'auth_failed'
          ? ' — ciphertext did not authenticate; check DATABASE_ENCRYPTION_KEY (wrong or rotated key?)'
          : result.reason === 'no_key'
            ? ' — DATABASE_ENCRYPTION_KEY is not set'
            : ' — value is not ciphertext (mislabelled row?)'),
    );
    return null;
  }
  return result.value;
}

/**
 * Get a decrypted credential value from a credential object.
 * Convenient wrapper for use with Prisma credential objects.
 */
export function getDecryptedKey(credential: { key: string; isEncrypted: boolean }): string | null {
  return decryptCredential(credential.key, credential.isEncrypted);
}

export interface CredentialRow {
  key: string;
  keyType: string;
  isEncrypted: boolean;
}

/**
 * Find a credential row by keyType, matching aliases case-insensitively.
 *
 * `keyType` is a free-form string with both `ACCESS_TOKEN`/`access_token` and
 * `API_KEY`/`api_key` spellings live in production, so exact-match lookups
 * silently miss rows written by a differently-cased writer. Aliases are tried
 * in order — put the canonical spelling first.
 */
export function findCredential<T extends { keyType: string }>(
  credentials: readonly T[],
  aliases: readonly string[],
): T | null {
  for (const alias of aliases) {
    const lowered = alias.toLowerCase();
    const match = credentials.find((c) => c.keyType.toLowerCase() === lowered);
    if (match) return match;
  }
  return null;
}

/**
 * Resolve a credential to its decrypted value.
 *
 * The single supported way to read a secret out of `IntegrationCredential`:
 * pass either an `integrationId` (scoped select of `key`/`keyType`/
 * `isEncrypted` — never fetch more) or already-loaded rows, plus the keyType
 * aliases to match (case-insensitive, in priority order). Returns `null` when
 * no row matches or the matched row fails to decrypt — callers must treat
 * `null` as "no usable secret" and fail closed.
 */
export async function resolveCredential(
  source: string | readonly CredentialRow[],
  aliases: readonly string[],
): Promise<string | null> {
  let rows: readonly CredentialRow[];
  if (typeof source === 'string') {
    // Imported lazily to keep this module usable in contexts that stub the db.
    const { db } = await import('~/server/db');
    rows = await db.integrationCredential.findMany({
      where: { integrationId: source },
      select: { key: true, keyType: true, isEncrypted: true },
    });
  } else {
    rows = source;
  }

  const match = findCredential(rows, aliases);
  return match ? getDecryptedKey(match) : null;
}
