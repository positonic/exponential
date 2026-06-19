/**
 * Move ONE CRM contact from James's Personal workspace into Syntrofi.
 *
 *   npx tsx scripts/move-contact.ts          # dry run — shows what it would do
 *   npx tsx scripts/move-contact.ts --apply  # performs the single update
 *
 * Safety: only ever touches the one hard-coded contact id, and only if it is
 * currently in the expected (Personal) workspace. Aborts on any mismatch.
 */
import { PrismaClient } from "@prisma/client";

const CONTACT_ID = "cmql2sai50001jo04eaq6sqw7";
const FROM_WS = "cmjzyn3x2001prze7jjcsiemw"; // Personal (expected current)
const TO_WS = "cmk01wbrb000arzxzj8zy4czg"; // Syntrofi (destination)
const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.crmContact.findUnique({
    where: { id: CONTACT_ID },
    select: { id: true, firstName: true, lastName: true, workspaceId: true },
  });
  console.log("Before:", before);

  if (!before) {
    console.log("❌ Contact not found — aborting.");
    return;
  }
  if (before.workspaceId === TO_WS) {
    console.log("✅ Already in Syntrofi — nothing to do.");
    return;
  }
  if (before.workspaceId !== FROM_WS) {
    console.log(
      `❌ Contact is in ${before.workspaceId}, not the expected Personal ws ` +
        `${FROM_WS}. Aborting so we don't move the wrong thing.`,
    );
    return;
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would set workspaceId: ${FROM_WS} → ${TO_WS}`);
    console.log("Re-run with --apply to perform the move.");
    return;
  }

  const after = await prisma.crmContact.update({
    where: { id: CONTACT_ID },
    data: { workspaceId: TO_WS },
    select: { id: true, firstName: true, lastName: true, workspaceId: true },
  });
  console.log("After: ", after);
  console.log("✅ Moved to Syntrofi. Refresh the contacts page.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
