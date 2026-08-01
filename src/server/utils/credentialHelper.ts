import { encryptToBase64, decryptFromBase64, isEncryptionAvailable } from './encryption';

/**
 * Helper for managing integration credentials with encryption support.
 * Handles backwards compatibility for existing plaintext credentials.
 */

/**
 * Encrypt a credential value for storage if encryption is available.
 * Returns the encrypted value and encryption status.
 */
export function encryptCredential(plaintext: string): { key: string; isEncrypted: boolean } {
  if (!isEncryptionAvailable()) {
    console.warn('DATABASE_ENCRYPTION_KEY not set - storing credential in plaintext');
    return { key: plaintext, isEncrypted: false };
  }

  try {
    const encrypted = encryptToBase64(plaintext);
    return { key: encrypted, isEncrypted: true };
  } catch (error) {
    console.error('Encryption failed, falling back to plaintext:', error);
    return { key: plaintext, isEncrypted: false };
  }
}

/**
 * Decrypt a credential value.
 * Handles both encrypted and plaintext credentials based on isEncrypted flag.
 */
export function decryptCredential(key: string, isEncrypted: boolean): string | null {
  if (!isEncrypted) {
    // Plaintext credential (legacy or encryption unavailable)
    return key;
  }

  try {
    const decrypted = decryptFromBase64(key);
    if (decrypted === null) {
      // Decryption failed - might be corrupted or wrong key
      console.error('Failed to decrypt credential - returning null');
      return null;
    }
    return decrypted;
  } catch (error) {
    console.error('Credential decryption error:', error);
    return null;
  }
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
