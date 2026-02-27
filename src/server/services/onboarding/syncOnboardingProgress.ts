import type { PrismaClient } from "@prisma/client";
import { STEP_KEY_TO_ACTION_NAME } from "./onboardingProjectTemplate";

/**
 * Marks the corresponding onboarding action as COMPLETED when the user
 * performs the real action elsewhere in the app (e.g. creates a goal).
 *
 * Designed to be called fire-and-forget (`void completeOnboardingStep(...)`)
 * so it never blocks the caller.
 */
export async function completeOnboardingStep(
  db: PrismaClient,
  userId: string,
  stepKey: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { onboardingProjectId: true, welcomeCompletedAt: true },
  });

  // Skip if no onboarding project or welcome already completed
  if (!user?.onboardingProjectId || user.welcomeCompletedAt) return;

  const actionName = STEP_KEY_TO_ACTION_NAME[stepKey];
  if (!actionName) return;

  // Find the matching onboarding action that is not yet completed
  const action = await db.action.findFirst({
    where: {
      projectId: user.onboardingProjectId,
      source: "onboarding",
      name: actionName,
      status: { not: "COMPLETED" },
    },
  });

  if (!action) return;

  await db.action.update({
    where: { id: action.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  // Update project progress
  const [totalCount, completedCount] = await Promise.all([
    db.action.count({
      where: { projectId: user.onboardingProjectId, source: "onboarding" },
    }),
    db.action.count({
      where: {
        projectId: user.onboardingProjectId,
        source: "onboarding",
        status: "COMPLETED",
      },
    }),
  ]);

  const allComplete = completedCount === totalCount;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  await db.project.update({
    where: { id: user.onboardingProjectId },
    data: {
      progress,
      ...(allComplete && { status: "COMPLETED" }),
    },
  });
}
