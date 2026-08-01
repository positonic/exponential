/**
 * Data-fix: repair Slack OAuth credentials mislabelled by the old callback.
 *
 * The Slack OAuth callback used to store the bot token in PLAINTEXT while
 * claiming `isEncrypted: true`, under keyType 'access_token' (which no Slack
 * consumer reads — they all read 'BOT_TOKEN'). Those rows both poison any
 * audit that trusts the flag and return null from getDecryptedKey.
 *
 * For every credential row on a slack-provider integration with
 * keyType 'access_token' (any casing):
 *   - if the flag claims encrypted but the value does not decrypt and looks
 *     like a raw Slack token (xox…), re-store it properly encrypted;
 *   - if it is plaintext-labelled, encrypt it too;
 *   - in all cases relabel keyType to 'BOT_TOKEN'.
 * Rows that decrypt fine just get the keyType relabel.
 *
 * Usage:
 *   npx tsx scripts/fix-slack-oauth-credentials.ts          # dry-run (default)
 *   npx tsx scripts/fix-slack-oauth-credentials.ts --apply  # actually update
 */

import { PrismaClient } from "@prisma/client";
import {
  decryptCredential,
  encryptCredential,
} from "../src/server/utils/credentialHelper";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  const rows = await db.integrationCredential.findMany({
    where: {
      integration: { provider: "slack" },
      keyType: { in: ["access_token", "ACCESS_TOKEN"] },
    },
    select: {
      id: true,
      key: true,
      keyType: true,
      isEncrypted: true,
      integrationId: true,
      integration: { select: { name: true } },
    },
  });

  console.log(`Found ${rows.length} slack 'access_token' credential row(s)\n`);

  let fixed = 0;
  let skipped = 0;

  for (const row of rows) {
    const decrypted = decryptCredential(row.key, row.isEncrypted);

    let newKey = row.key;
    let newIsEncrypted = row.isEncrypted;
    let reason: string;

    if (decrypted !== null && row.isEncrypted) {
      // Genuinely encrypted — only the keyType label is wrong.
      reason = "relabel keyType only (row decrypts fine)";
    } else if (decrypted !== null && !row.isEncrypted) {
      // Honest plaintext — encrypt it while we're here.
      const enc = encryptCredential(decrypted);
      newKey = enc.key;
      newIsEncrypted = enc.isEncrypted;
      reason = "encrypt plaintext row + relabel keyType";
    } else if (row.key.startsWith("xox")) {
      // Mislabelled: flag says encrypted but the value is a raw Slack token.
      const enc = encryptCredential(row.key);
      newKey = enc.key;
      newIsEncrypted = enc.isEncrypted;
      reason = "flag claimed encrypted but value is a raw xox… token — re-encrypt + relabel";
    } else {
      console.log(
        `  SKIP ${row.id} (${row.integration.name}): claims encrypted, does not decrypt, does not look like a raw token — needs manual review`,
      );
      skipped++;
      continue;
    }

    console.log(`  FIX  ${row.id} (${row.integration.name}): ${reason}`);

    if (apply) {
      await db.integrationCredential.update({
        where: { id: row.id },
        data: { key: newKey, keyType: "BOT_TOKEN", isEncrypted: newIsEncrypted },
      });
    }
    fixed++;
  }

  console.log(
    `\n${apply ? "Fixed" : "Would fix"} ${fixed} row(s), ${skipped} need manual review.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
