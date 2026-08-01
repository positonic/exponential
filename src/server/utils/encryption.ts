import crypto from 'crypto';

const KEY_ENV = process.env.DATABASE_ENCRYPTION_KEY || '';
if (!KEY_ENV) {
  console.warn('DATABASE_ENCRYPTION_KEY not set - encryption will not be available in production');
}

/**
 * Decrypt-only fallback for key rotation: set DATABASE_ENCRYPTION_KEY to the
 * NEW key and DATABASE_ENCRYPTION_KEY_PREVIOUS to the old one, deploy, run
 * scripts/reencrypt-under-current-key.ts, then drop the previous key. See
 * dev-docs/ENCRYPTION_KEY_ROTATION.md. Never used for encryption.
 */
const KEY_PREVIOUS_ENV = process.env.DATABASE_ENCRYPTION_KEY_PREVIOUS || '';

// Expect a key to be base64 or raw 32-byte string. Normalize to Buffer of length 32.
function normalizeKey(envValue: string, name: string): Buffer {
  if (!envValue) throw new Error(`${name} is not defined`);
  try {
    const buf = Buffer.from(envValue, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // fallthrough - try raw encoding
  }
  const raw = Buffer.from(envValue);
  if (raw.length === 32) return raw;
  throw new Error(`${name} must be 32 bytes (raw) or base64-encoded 32 bytes`);
}

function getKey(): Buffer {
  return normalizeKey(KEY_ENV, 'DATABASE_ENCRYPTION_KEY');
}

function getPreviousKey(): Buffer | null {
  if (!KEY_PREVIOUS_ENV) return null;
  return normalizeKey(KEY_PREVIOUS_ENV, 'DATABASE_ENCRYPTION_KEY_PREVIOUS');
}

export function encryptString(plaintext: string): Uint8Array<ArrayBuffer> {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store as iv + tag + encrypted
  const buf = Buffer.concat([iv, tag, encrypted]);
  // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy Prisma 6.19+ Bytes type
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

function decryptDataWithKey(data: Buffer, key: Buffer): string {
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Decrypt binary ciphertext, reporting which key succeeded. Tries the current
 * DATABASE_ENCRYPTION_KEY first, then DATABASE_ENCRYPTION_KEY_PREVIOUS (if
 * set) as a decrypt-only fallback during rotation. Throws on auth failure of
 * every available key (see decryptBuffer for the null-collapsing form).
 */
export function decryptBufferWithKeyInfo(
  buf: Buffer | Uint8Array | null | undefined,
): { value: string; usedPreviousKey: boolean } | null {
  if (!buf) return null;
  const data = Buffer.from(buf);
  if (data.length < 28) return null; // iv(12) + tag(16) at least
  try {
    return { value: decryptDataWithKey(data, getKey()), usedPreviousKey: false };
  } catch (error) {
    const previousKey = getPreviousKey();
    if (!previousKey) throw error;
    try {
      return { value: decryptDataWithKey(data, previousKey), usedPreviousKey: true };
    } catch {
      // Report the current-key failure — that's the actionable one.
      throw error;
    }
  }
}

export function decryptBuffer(buf: Buffer | Uint8Array | null | undefined): string | null {
  const result = decryptBufferWithKeyInfo(buf);
  return result === null ? null : result.value;
}

/**
 * decryptBuffer that never throws: a wrong/rotated key degrades to null
 * (logged) instead of 500ing the caller. Use for display paths — CRM contact
 * PII in particular — where a page rendering with blank fields beats an
 * error page. Keep decryptBuffer for callers that must fail loudly.
 */
export function decryptBufferSafe(buf: Buffer | Uint8Array | null | undefined): string | null {
  try {
    return decryptBuffer(buf);
  } catch (error) {
    console.error(
      '[encryption] decryptBufferSafe: value did not authenticate under any available key — check DATABASE_ENCRYPTION_KEY (wrong or rotated?)',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Version prefix for string-form ciphertext. Written on every encrypt so a
 * future scheme change (new algorithm, key id) has something to dispatch on;
 * legacy unprefixed values are treated as v1.
 */
const CIPHERTEXT_V1_PREFIX = 'v1:';

/**
 * Encrypt a string and return it as version-prefixed base64 (`v1:<base64>`).
 * Useful for storing encrypted data in String database fields.
 */
export function encryptToBase64(plaintext: string): string {
  const encrypted = encryptString(plaintext);
  return CIPHERTEXT_V1_PREFIX + Buffer.from(encrypted).toString('base64');
}

/**
 * Why a decrypt failed. `no_key` — DATABASE_ENCRYPTION_KEY absent;
 * `not_ciphertext` — the value cannot be iv12+tag16+ct (too short / empty);
 * `auth_failed` — structurally plausible ciphertext whose GCM auth tag did
 * not verify: wrong/rotated key, corruption, or mislabelled plaintext.
 * The distinction is what makes a key-rotation mistake alertable instead of
 * looking like "the user never configured this integration".
 */
export type DecryptFailureReason = 'no_key' | 'auth_failed' | 'not_ciphertext';

export type DecryptResult =
  | { ok: true; value: string }
  | { ok: false; reason: DecryptFailureReason };

/**
 * Decrypt a (possibly version-prefixed) base64-encoded encrypted string,
 * reporting WHY on failure and WHICH key succeeded. Accepts both
 * `v1:<base64>` and legacy unprefixed `<base64>` (treated as v1).
 * `usedPreviousKey` / `hadVersionPrefix` drive the rotation re-encrypt
 * script (scripts/reencrypt-under-current-key.ts).
 */
export function decryptFromBase64WithKeyInfo(
  base64Encrypted: string | null | undefined,
):
  | { ok: true; value: string; usedPreviousKey: boolean; hadVersionPrefix: boolean }
  | { ok: false; reason: DecryptFailureReason } {
  if (!base64Encrypted) return { ok: false, reason: 'not_ciphertext' };
  if (!KEY_ENV) return { ok: false, reason: 'no_key' };

  const hadVersionPrefix = base64Encrypted.startsWith(CIPHERTEXT_V1_PREFIX);
  const base64 = hadVersionPrefix
    ? base64Encrypted.slice(CIPHERTEXT_V1_PREFIX.length)
    : base64Encrypted;

  // NOTE: Buffer.from(x, 'base64') does not throw on non-base64 input — it
  // decodes what it can, so length is the only structural signal here.
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 28) return { ok: false, reason: 'not_ciphertext' }; // iv(12) + tag(16)

  try {
    const result = decryptBufferWithKeyInfo(buf);
    if (result === null) return { ok: false, reason: 'not_ciphertext' };
    return { ok: true, value: result.value, usedPreviousKey: result.usedPreviousKey, hadVersionPrefix };
  } catch {
    // GCM auth-tag verification failure under every available key.
    return { ok: false, reason: 'auth_failed' };
  }
}

/**
 * Decrypt a (possibly version-prefixed) base64-encoded encrypted string,
 * reporting WHY on failure.
 */
export function decryptFromBase64Result(
  base64Encrypted: string | null | undefined,
): DecryptResult {
  const result = decryptFromBase64WithKeyInfo(base64Encrypted);
  return result.ok ? { ok: true, value: result.value } : result;
}

/**
 * Decrypt a (possibly version-prefixed) base64-encoded encrypted string.
 * Accepts both `v1:<base64>` and legacy unprefixed `<base64>` (treated as v1).
 * Collapses all failures to null — prefer decryptFromBase64Result where the
 * failure reason matters.
 */
export function decryptFromBase64(base64Encrypted: string | null | undefined): string | null {
  const result = decryptFromBase64Result(base64Encrypted);
  return result.ok ? result.value : null;
}

/**
 * Check if DATABASE_ENCRYPTION_KEY is configured.
 * Returns true if encryption is available.
 */
export function isEncryptionAvailable(): boolean {
  return !!KEY_ENV;
}
