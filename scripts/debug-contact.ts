/**
 * READ-ONLY diagnostic: why isn't a CRM contact showing on the contacts page?
 *
 * Usage (point DATABASE_URL at the DB you want to inspect):
 *   DATABASE_URL="postgres://...prod..." npx tsx scripts/debug-contact.ts
 *   DATABASE_URL="postgres://..." npx tsx scripts/debug-contact.ts <contactId> <workspaceSlug> <searchName>
 *
 * Defaults below match the Eliud Maiko investigation. This script ONLY reads
 * (findUnique / findMany / count) — it never writes.
 *
 * What it checks, matching the real list query in
 *   src/server/api/routers/crmContact.ts (getAll): default limit 50,
 *   orderBy [{ lastInteractionAt: desc, nulls: last }, { createdAt: desc }]
 * and the page (src/app/(sidemenu)/w/[workspaceSlug]/crm/contacts/page.tsx)
 * which passes NO limit (so 50) and has no "load more".
 */
import { PrismaClient } from "@prisma/client";

const CONTACT_ID = process.argv[2] ?? "cmql2sai50001jo04eaq6sqw7";
const WORKSPACE_SLUG = process.argv[3] ?? "syntrofi";
const SEARCH_NAME = process.argv[4] ?? "Eliud";
const PAGE_LIMIT = 50; // the page's effective limit

const prisma = new PrismaClient();

function line() {
  console.log("─".repeat(70));
}

async function main() {
  console.log(`DB host: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}`);
  line();

  // 1. Resolve the workspace the page queries
  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!workspace) {
    console.log(`❌ No workspace with slug "${WORKSPACE_SLUG}". Cannot continue.`);
    return;
  }
  console.log(`Workspace "${WORKSPACE_SLUG}":`, workspace);
  line();

  // 2. Look up the target contact directly (ignores workspace/sort)
  const contact = await prisma.crmContact.findUnique({
    where: { id: CONTACT_ID },
    select: {
      id: true,
      workspaceId: true,
      firstName: true,
      lastName: true,
      email: true, // encrypted bytes — only check presence
      emailHash: true,
      lastInteractionAt: true,
      lastInteractionType: true,
      importSource: true,
      createdById: true,
      createdAt: true,
      tags: true,
      organizationId: true,
    },
  });

  if (!contact) {
    console.log(`❌ No contact with id ${CONTACT_ID}. Searching by name "${SEARCH_NAME}" instead…`);
  } else {
    console.log("Target contact (direct lookup):");
    console.log({
      ...contact,
      email: contact.email ? `<${contact.email.length} bytes>` : null,
    });
    line();
    // Workspace match?
    if (contact.workspaceId !== workspace.id) {
      console.log(
        `🚨 WORKSPACE MISMATCH: contact.workspaceId=${contact.workspaceId} ` +
          `but "${WORKSPACE_SLUG}".id=${workspace.id}. The page queries the ` +
          `latter, so this contact will NEVER appear here.`,
      );
      line();
    }
  }

  // 3. Find any contacts whose name matches the search (in this workspace)
  const byName = await prisma.crmContact.findMany({
    where: {
      workspaceId: workspace.id,
      OR: [
        { firstName: { contains: SEARCH_NAME, mode: "insensitive" } },
        { lastName: { contains: SEARCH_NAME, mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, lastInteractionAt: true, createdAt: true },
  });
  console.log(`Name search "${SEARCH_NAME}" in workspace → ${byName.length} match(es):`);
  console.table(byName);
  line();

  // 4. Replicate the EXACT list query (same where + orderBy as getAll) and
  //    compute the target's rank, to see if it falls past the 50-row page.
  const targetId = contact?.id ?? byName[0]?.id;
  const totalInWorkspace = await prisma.crmContact.count({ where: { workspaceId: workspace.id } });
  console.log(`Total contacts in workspace: ${totalInWorkspace}`);

  if (targetId) {
    const ordered = await prisma.crmContact.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ lastInteractionAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: { id: true },
    });
    const rank = ordered.findIndex((c) => c.id === targetId); // 0-based
    if (rank === -1) {
      console.log(`🚨 Target ${targetId} is NOT in the workspace's contact list at all.`);
    } else {
      console.log(`Target sort position: row ${rank + 1} of ${ordered.length}`);
      if (rank + 1 > PAGE_LIMIT) {
        console.log(
          `🚨 ROW ${rank + 1} > PAGE LIMIT ${PAGE_LIMIT}. The page only fetches the ` +
            `first ${PAGE_LIMIT} and has no "load more", so this contact is off-page → invisible.`,
        );
      } else {
        console.log(`✅ Within the first ${PAGE_LIMIT} rows — pagination is NOT the cause; look elsewhere.`);
      }
    }
  }
  line();

  // 5. How many contacts have an interaction (sort ahead of null-interaction ones)?
  const withInteraction = await prisma.crmContact.count({
    where: { workspaceId: workspace.id, lastInteractionAt: { not: null } },
  });
  console.log(
    `Contacts WITH lastInteractionAt: ${withInteraction} ` +
      `(these all sort ahead of a manually-added, never-emailed contact).`,
  );
}

main()
  .catch((e) => {
    console.error("Script error:", e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
