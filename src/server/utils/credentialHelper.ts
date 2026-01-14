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
