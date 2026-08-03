/**
 * Read-only census of IntegrationCredential encryption state (2026-07-30
 * integration-secrets audit, V4 — run BEFORE the backfill and paste the
 * output on ticket scarlet.glyph).
 *
 * Reports, by keyType:
 *   - plaintext vs marked-encrypted row counts
 *   - "impossible ciphertext": rows claiming isEncrypted = true whose value is
 *     too short to be base64(iv12 + tag16 + ct)
 * and separately the mislabel class: plaintext provider tokens (xox…, ntn_…,
 * gh*_…, EAA…, secret_…) flagged isEncrypted = true.
 *
 * Makes NO writes. Usage:
 *   npx tsx scripts/census-credential-encryption.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const byKeyType = await db.$queryRaw<
    Array<{
      keyType: string;
      total: bigint;
      plaintext: bigint;
      marked_encrypted: bigint;
      impossible_ciphertext: bigint;
    }>
  >`
    SELECT "keyType",
           COUNT(*)                                                            AS total,
           COUNT(*) FILTER (WHERE "isEncrypted" = false)                       AS plaintext,
           COUNT(*) FILTER (WHERE "isEncrypted" = true)                        AS marked_encrypted,
           COUNT(*) FILTER (WHERE "isEncrypted" = true AND length("key") < 40) AS impossible_ciphertext
    FROM "IntegrationCredential"
    GROUP BY "keyType"
    ORDER BY plaintext DESC, total DESC;
  `;

  const mislabelled = await db.$queryRaw<
    Array<{ provider: string; keyType: string; count: bigint }>
  >`
    SELECT i.provider, c."keyType", COUNT(*) AS count
    FROM "IntegrationCredential" c
    JOIN "Integration" i ON i.id = c."integrationId"
    WHERE c."isEncrypted" = true
      AND (c."key" LIKE 'xox%'
        OR c."key" LIKE 'secret_%' OR c."key" LIKE 'ntn_%'
        OR c."key" LIKE 'gh%_%'
        OR c."key" LIKE 'EAA%')
    GROUP BY 1, 2 ORDER BY 3 DESC;
  `;

  console.log("== 1. Encryption state by keyType ==");
  console.table(
    byKeyType.map((r) => ({
      keyType: r.keyType,
      total: Number(r.total),
      plaintext: Number(r.plaintext),
      marked_encrypted: Number(r.marked_encrypted),
      impossible_ciphertext: Number(r.impossible_ciphertext),
    })),
  );

  console.log("\n== 2. Plaintext provider tokens flagged isEncrypted = true ==");
  if (mislabelled.length === 0) {
    console.log("(none)");
  } else {
    console.table(
      mislabelled.map((r) => ({
        provider: r.provider,
        keyType: r.keyType,
        count: Number(r.count),
      })),
    );
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
