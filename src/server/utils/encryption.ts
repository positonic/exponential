import crypto from 'crypto';

const KEY_ENV = process.env.DATABASE_ENCRYPTION_KEY || '';
if (!KEY_ENV) {
  console.warn('DATABASE_ENCRYPTION_KEY not set - encryption will not be available in production');
}

// Expect the key to be base64 or raw 32-byte string. Normalize to Buffer of length 32.
function getKey(): Buffer {
  if (!KEY_ENV) throw new Error('DATABASE_ENCRYPTION_KEY is not defined');
  try {
    const buf = Buffer.from(KEY_ENV, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    // fallthrough - try raw encoding
  }
  const raw = Buffer.from(KEY_ENV);
  if (raw.length === 32) return raw;
  throw new Error('DATABASE_ENCRYPTION_KEY must be 32 bytes (raw) or base64-encoded 32 bytes');
}

export function encryptString(plaintext: string): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store as iv + tag + encrypted
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptBuffer(buf: Buffer | Uint8Array | null | undefined): string | null {
  if (!buf) return null;
  const data = Buffer.from(buf);
  if (data.length < 28) return null; // iv(12) + tag(16) at least
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt a string and return it as a base64-encoded string.
 * Useful for storing encrypted data in String database fields.
 */
export function encryptToBase64(plaintext: string): string {
  const encrypted = encryptString(plaintext);
  return encrypted.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Useful for reading encrypted data from String database fields.
 */
export function decryptFromBase64(base64Encrypted: string | null | undefined): string | null {
  if (!base64Encrypted) return null;
  try {
    const buf = Buffer.from(base64Encrypted, 'base64');
    return decryptBuffer(buf);
  } catch {
    // If decryption fails, the value might be stored in plaintext (legacy)
    return null;
  }
}

/**
 * Check if DATABASE_ENCRYPTION_KEY is configured.
 * Returns true if encryption is available.
 */
export function isEncryptionAvailable(): boolean {
  return !!KEY_ENV;
}
