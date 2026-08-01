/**
 * Backfill: encrypt plaintext secret credential rows and repair mislabelled
 * ones (2026-07-30 integration-secrets audit, V4 — run AFTER the census,
 * scripts/census-credential-encryption.ts, and BEFORE enforcement matters).
 *
 * Idempotent: a second run reports zero changes. Per row:
 *   - allowlisted deliberate-plaintext keyTypes are never touched;
 *   - isEncrypted=false secret rows are encrypted;
 *   - isEncrypted=true rows that decrypt are left alone (already correct);
 *   - isEncrypted=true rows that do NOT decrypt but look like a raw provider
 *     token (xox…, ntn_…, secret_…, gh*_…, EAA…) are mislabelled plaintext —
 *     re-encrypted properly;
 *   - isEncrypted=true rows that neither decrypt nor look like raw tokens are
 *     reported for manual review (could be ciphertext under a different key —
 *     encrypting them again would destroy them).
 *
 * Usage:
 *   npx tsx scripts/backfill-credential-encryption.ts          # dry-run (default)
 *   npx tsx scripts/backfill-credential-encryption.ts --apply  # actually update
 */

import { PrismaClient } from "@prisma/client";
import {
  decryptCredential,
  encryptCredential,
} from "../src/server/utils/credentialHelper";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

/** keyTypes that are deliberately plaintext (labels, hosts, ids — not secrets). */
const PLAINTEXT_ALLOWLIST = new Set(
  [
    "slack_metadata",
    "notion_metadata",
    "github_metadata",
    "TEAM_ID",
    "APP_ID",
    "PHONE_NUMBER_ID",
    "BUSINESS_ACCOUNT_ID",
    "email_address",
    "imap_host",
    "smtp_host",
    "from_address",
    "SERVER_URL",
    "BOT_EMAIL",
    "DEFAULT_STREAM",
    "DEFAULT_TOPIC",
    "EMAIL",
  ].map((t) => t.toLowerCase()),
);

function looksLikeRawProviderToken(value: string): boolean {
  return (
    value.startsWith("xox") ||
    value.startsWith("secret_") ||
    value.startsWith("ntn_") ||
    /^gh[a-z]_/.test(value) ||
    value.startsWith("EAA")
  );
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  if (!process.env.DATABASE_ENCRYPTION_KEY) {
    throw new Error(
      "DATABASE_ENCRYPTION_KEY is not set — refusing to run: the backfill would have nothing to encrypt with.",
    );
  }

  const rows = await db.integrationCredential.findMany({
    select: { id: true, key: true, keyType: true, isEncrypted: true },
  });

  const counts = {
    allowlisted: 0,
    alreadyEncrypted: 0,
    encryptedPlaintext: 0,
    repairedMislabelled: 0,
    needsManualReview: 0,
  };
  const byKeyType = new Map<string, number>();
  const bump = (keyType: string) =>
    byKeyType.set(keyType, (byKeyType.get(keyType) ?? 0) + 1);

  for (const row of rows) {
    if (PLAINTEXT_ALLOWLIST.has(row.keyType.toLowerCase())) {
      counts.allowlisted++;
      continue;
    }

    if (row.isEncrypted) {
      if (decryptCredential(row.key, true) !== null) {
        counts.alreadyEncrypted++;
        continue;
      }
      if (!looksLikeRawProviderToken(row.key)) {
        console.log(
          `  REVIEW ${row.id} (${row.keyType}): claims encrypted, does not decrypt, not a recognizable raw token — not touching`,
        );
        counts.needsManualReview++;
        continue;
      }
      // Mislabelled: flag says encrypted but the value is a raw token.
      const enc = encryptCredential(row.key);
      console.log(`  FIX    ${row.id} (${row.keyType}): mislabelled plaintext token — re-encrypting`);
      if (apply) {
        await db.integrationCredential.update({
          where: { id: row.id },
          data: { key: enc.key, isEncrypted: enc.isEncrypted },
        });
      }
      counts.repairedMislabelled++;
      bump(row.keyType);
      continue;
    }

    // Honest plaintext secret — encrypt it.
    const enc = encryptCredential(row.key);
    console.log(`  FIX    ${row.id} (${row.keyType}): plaintext secret — encrypting`);
    if (apply) {
      await db.integrationCredential.update({
        where: { id: row.id },
        data: { key: enc.key, isEncrypted: enc.isEncrypted },
      });
    }
    counts.encryptedPlaintext++;
    bump(row.keyType);
  }

  console.log(`\n== Summary (${apply ? "applied" : "dry-run"}) ==`);
  console.table(counts);
  if (byKeyType.size > 0) {
    console.log("Changed rows by keyType:");
    console.table(Object.fromEntries(byKeyType));
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
