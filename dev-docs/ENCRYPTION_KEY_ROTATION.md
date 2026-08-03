# Encryption key rotation runbook

`DATABASE_ENCRYPTION_KEY` encrypts every `IntegrationCredential.key` (string
form, `v1:<base64(iv12+tag16+ct)>`, AES-256-GCM) and the CRM PII `Bytes`
columns (`CrmContact` email/phone/socials, `CrmCommunication` from/to fields,
`User.phone`). Rotation is supported via a decrypt-only fallback key:
`DATABASE_ENCRYPTION_KEY_PREVIOUS`.

Both keys are 32 bytes, raw or base64 (validated in `src/env.js`).

## Rotation procedure

1. **Add previous** — set `DATABASE_ENCRYPTION_KEY_PREVIOUS` to the *current*
   key, and `DATABASE_ENCRYPTION_KEY` to the *new* key (generate with
   `openssl rand -base64 32`), in every environment that talks to the DB.
2. **Deploy** — all reads now try the new key first and fall back to the old
   one; all writes use the new key. Nothing breaks mid-rotation.
3. **Re-encrypt** — rewrite every stored row under the new key:

   ```bash
   npx tsx scripts/reencrypt-under-current-key.ts          # dry-run, review output
   npx tsx scripts/reencrypt-under-current-key.ts --apply
   ```

   The script is idempotent (a second run reports zero changes) and exits
   non-zero if any value failed to decrypt under either key — **do not
   proceed to step 4 while failures remain**.
4. **Drop previous** — remove `DATABASE_ENCRYPTION_KEY_PREVIOUS` and deploy
   again. Rotation complete.

## Observability

Decrypt failures are reason-coded (`no_key` / `auth_failed` /
`not_ciphertext`, see `DecryptFailureReason` in
`src/server/utils/encryption.ts`). After a rotation, alert on `auth_failed`
in logs: it means ciphertext that authenticates under *neither* key — a
wrong key or skipped re-encrypt — and is deliberately distinguishable from an
integration that was never configured.

## Related

- `scripts/census-credential-encryption.ts` — read-only state census (V4).
- `scripts/backfill-credential-encryption.ts` — one-time plaintext backfill (V4).
- `src/server/utils/credentialHelper.ts` — the only sanctioned read/write API
  for credential secrets (`encryptCredential`, `resolveCredential`,
  `decryptCredentialResult`).
