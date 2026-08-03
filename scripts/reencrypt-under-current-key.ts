/**
 * Key-rotation re-encrypt: rewrite every encrypted row under the CURRENT
 * DATABASE_ENCRYPTION_KEY (2026-07-30 integration-secrets audit, V5).
 *
 * Run with BOTH keys set — DATABASE_ENCRYPTION_KEY (new) and
 * DATABASE_ENCRYPTION_KEY_PREVIOUS (old). Rows that decrypt under the
 * previous key are re-encrypted under the current one; rows already under the
 * current key are only rewritten when they lack the v1: version prefix
 * (string form). Idempotent: a second run reports zero changes.
 *
 * Covers:
 *   - IntegrationCredential.key (string ciphertext, isEncrypted = true)
 *   - CrmContact PII Bytes columns (email/phone/linkedIn/telegram/twitter/github/bluesky)
 *   - CrmCommunication Bytes columns (fromEmail/toEmail/fromTelegram/toTelegram)
 *   - User.phone (Bytes)
 *
 * Usage:
 *   npx tsx scripts/reencrypt-under-current-key.ts          # dry-run (default)
 *   npx tsx scripts/reencrypt-under-current-key.ts --apply  # actually update
 *
 * Full runbook: dev-docs/ENCRYPTION_KEY_ROTATION.md
 */

import { PrismaClient } from "@prisma/client";
import {
  decryptFromBase64WithKeyInfo,
  decryptBufferWithKeyInfo,
  encryptToBase64,
  encryptString,
} from "../src/server/utils/encryption";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

const counts = {
  rewrittenFromPreviousKey: 0,
  normalizedVersionPrefix: 0,
  alreadyCurrent: 0,
  failed: 0,
};

async function reencryptCredentials() {
  const rows = await db.integrationCredential.findMany({
    where: { isEncrypted: true },
    select: { id: true, key: true, keyType: true },
  });

  for (const row of rows) {
    const result = decryptFromBase64WithKeyInfo(row.key);
    if (!result.ok) {
      console.log(`  FAIL   credential ${row.id} (${row.keyType}): ${result.reason} — needs manual review`);
      counts.failed++;
      continue;
    }
    if (!result.usedPreviousKey && result.hadVersionPrefix) {
      counts.alreadyCurrent++;
      continue;
    }
    const label = result.usedPreviousKey ? "previous key" : "missing v1 prefix";
    console.log(`  REWRITE credential ${row.id} (${row.keyType}): ${label}`);
    if (apply) {
      await db.integrationCredential.update({
        where: { id: row.id },
        data: { key: encryptToBase64(result.value) },
      });
    }
    if (result.usedPreviousKey) counts.rewrittenFromPreviousKey++;
    else counts.normalizedVersionPrefix++;
  }
}

/** Re-encrypt one nullable Bytes field value; returns the new value or undefined when no rewrite is needed. */
function reencryptBytes(
  label: string,
  value: Uint8Array | null,
): Uint8Array<ArrayBuffer> | undefined {
  if (!value || value.length === 0) return undefined;
  try {
    const result = decryptBufferWithKeyInfo(value);
    if (result === null) {
      console.log(`  FAIL   ${label}: not ciphertext — needs manual review`);
      counts.failed++;
      return undefined;
    }
    if (!result.usedPreviousKey) {
      counts.alreadyCurrent++;
      return undefined;
    }
    console.log(`  REWRITE ${label}: previous key`);
    counts.rewrittenFromPreviousKey++;
    return encryptString(result.value);
  } catch {
    console.log(`  FAIL   ${label}: does not decrypt under any available key — needs manual review`);
    counts.failed++;
    return undefined;
  }
}

async function reencryptCrmContacts() {
  const fields = ["email", "phone", "linkedIn", "telegram", "twitter", "github", "bluesky"] as const;
  const rows = await db.crmContact.findMany({
    select: Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]) as Record<string, true>,
  });
  for (const row of rows as unknown as Array<Record<string, Uint8Array | string | null>>) {
    const data: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (const f of fields) {
      const updated = reencryptBytes(`CrmContact ${row.id as string}.${f}`, row[f] as Uint8Array | null);
      if (updated) data[f] = updated;
    }
    if (Object.keys(data).length > 0 && apply) {
      await db.crmContact.update({ where: { id: row.id as string }, data });
    }
  }
}

async function reencryptCrmCommunications() {
  const fields = ["fromEmail", "toEmail", "fromTelegram", "toTelegram"] as const;
  const rows = await db.crmCommunication.findMany({
    select: Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]) as Record<string, true>,
  });
  for (const row of rows as unknown as Array<Record<string, Uint8Array | string | null>>) {
    const data: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (const f of fields) {
      const updated = reencryptBytes(`CrmCommunication ${row.id as string}.${f}`, row[f] as Uint8Array | null);
      if (updated) data[f] = updated;
    }
    if (Object.keys(data).length > 0 && apply) {
      await db.crmCommunication.update({ where: { id: row.id as string }, data });
    }
  }
}

async function reencryptUserPhones() {
  const rows = await db.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  for (const row of rows) {
    const updated = reencryptBytes(`User ${row.id}.phone`, row.phone);
    if (updated && apply) {
      await db.user.update({ where: { id: row.id }, data: { phone: updated } });
    }
  }
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  if (!process.env.DATABASE_ENCRYPTION_KEY) {
    throw new Error("DATABASE_ENCRYPTION_KEY is not set — nothing to re-encrypt under.");
  }
  if (!process.env.DATABASE_ENCRYPTION_KEY_PREVIOUS) {
    console.warn(
      "DATABASE_ENCRYPTION_KEY_PREVIOUS is not set — only v1-prefix normalization will happen; rows under an old key will FAIL.\n",
    );
  }

  await reencryptCredentials();
  await reencryptCrmContacts();
  await reencryptCrmCommunications();
  await reencryptUserPhones();

  console.log(`\n== Summary (${apply ? "applied" : "dry-run"}) ==`);
  console.table(counts);
  if (counts.failed > 0) {
    console.error(`\n${counts.failed} value(s) failed to decrypt — do NOT drop the previous key until resolved.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
