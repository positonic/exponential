import { type PrismaClient } from "@prisma/client";
import { contentGenerationTemplate } from "./templates/contentGeneration";

const SYSTEM_TEMPLATES = [contentGenerationTemplate];

export async function seedWorkflowTemplates(db: PrismaClient): Promise<void> {
  for (const template of SYSTEM_TEMPLATES) {
    await db.workflowTemplate.upsert({
      where: { slug: template.slug },
      create: {
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        triggerTypes: [...template.triggerTypes],
        configSchema: template.configSchema,
        stepDefinitions: template.stepDefinitions,
        isSystem: true,
        isActive: true,
      },
      update: {
        name: template.name,
        description: template.description,
        category: template.category,
        triggerTypes: [...template.triggerTypes],
        configSchema: template.configSchema,
        stepDefinitions: template.stepDefinitions,
      },
    });
  }
}
