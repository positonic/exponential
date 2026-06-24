/**
 * Seed the demo `list_member_added` Automations (ADR-0031).
 *
 * Two Lists each get one Automation that sends an email when a contact is added:
 *   - cmqrxpi710005l604djpw2z75  → acknowledgement email
 *   - cmqrxqgp20001l404e44152cz  → welcome email
 *
 * Idempotent: skips a List that already has an automation. Run once:
 *   npx tsx scripts/seed-list-automations.ts
 */
import { PrismaClient, type Prisma } from "@prisma/client";

import { LIST_MEMBER_ADDED_TRIGGER } from "../src/server/services/crm/automation/listMemberTrigger";

const db = new PrismaClient();

interface ListAutomationSpec {
  listId: string;
  name: string;
  subject: string;
  /** Plain text; `{{firstName}}`, `{{fullName}}`, `{{email}}` are interpolated. */
  body: string;
}

const SPECS: ListAutomationSpec[] = [
  {
    listId: "cmqrxpi710005l604djpw2z75",
    name: "List acknowledgement email",
    subject: "Thanks — we've received your details",
    body: [
      "Hi {{firstName}},",
      "",
      "Thanks for signing up — this is a quick note to acknowledge we've got your details and will be in touch shortly.",
      "",
      "Best,",
      "The team",
    ].join("\n"),
  },
  {
    listId: "cmqrxqgp20001l404e44152cz",
    name: "List welcome email",
    subject: "Welcome aboard!",
    body: [
      "Hi {{firstName}},",
      "",
      "Welcome! We're delighted to have you on board. We'll be in touch with next steps soon.",
      "",
      "Best,",
      "The team",
    ].join("\n"),
  },
];

async function main() {
  for (const spec of SPECS) {
    const collection = await db.collection.findUnique({
      where: { id: spec.listId },
      select: { id: true, workspaceId: true, createdById: true, name: true },
    });
    if (!collection) {
      console.error(`✗ List ${spec.listId} not found — skipping "${spec.name}"`);
      continue;
    }

    const existing = await db.workflowDefinition.findFirst({
      where: {
        workspaceId: collection.workspaceId,
        triggerType: LIST_MEMBER_ADDED_TRIGGER,
        config: { path: ["listId"], equals: spec.listId },
      },
      select: { id: true },
    });
    if (existing) {
      console.log(
        `• List ${spec.listId} already has automation ${existing.id} — leaving as-is`,
      );
      continue;
    }

    // Need a creator. Prefer the List's creator; fall back to any workspace member.
    let createdById = collection.createdById;
    if (!createdById) {
      const member = await db.workspaceUser.findFirst({
        where: { workspaceId: collection.workspaceId },
        select: { userId: true },
      });
      createdById = member?.userId ?? null;
    }
    if (!createdById) {
      console.error(
        `✗ No user found for workspace ${collection.workspaceId} — skipping "${spec.name}"`,
      );
      continue;
    }

    const def = await db.workflowDefinition.create({
      data: {
        workspaceId: collection.workspaceId,
        createdById,
        templateId: null,
        name: spec.name,
        description: `Sends an email when a contact is added to "${collection.name}".`,
        config: { listId: spec.listId, isDefault: false } as Prisma.InputJsonValue,
        triggerType: LIST_MEMBER_ADDED_TRIGGER,
        isActive: true,
        steps: {
          create: [
            {
              order: 0,
              type: "send_email",
              label: spec.name,
              config: {
                // SendEmailStep requires a customerType; for a List send it is
                // a neutral placeholder — the real copy is subject/body.
                customerType: "Member",
                subject: spec.subject,
                body: spec.body,
              } as Prisma.InputJsonValue,
            },
          ],
        },
      },
    });
    console.log(
      `✓ Created automation ${def.id} for List "${collection.name}" (${spec.listId}) — "${spec.name}"`,
    );
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
